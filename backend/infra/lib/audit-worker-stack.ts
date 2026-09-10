import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export type AuditWorkerStage = 'dev' | 'prod';

/** Same shared ZappSites VPC / RDS / SG IDs as LocalSeoApiStack. */
const STAGE_CONFIG: Record<
  AuditWorkerStage,
  {
    vpcId: string;
    subnetIds: string[];
    lambdaSgId: string;
    proxyEndpoint: string;
    dbSecretName: string;
  }
> = {
  dev: {
    vpcId: 'vpc-02e5014ea180674da',
    subnetIds: ['subnet-054a01f66933cf36d', 'subnet-08ae6da127b1458d4'],
    lambdaSgId: 'sg-0167438f34915d1e2',
    proxyEndpoint: 'rdsproxy.proxy-cehyac2sc676.us-east-1.rds.amazonaws.com',
    dbSecretName: 'ZappsitesDatabase-dev/credentials',
  },
  prod: {
    vpcId: 'vpc-00cb8c1fb56aa6e38',
    subnetIds: ['subnet-0b23b96b9b71b80fc', 'subnet-0b58a151dd40fc94e'],
    lambdaSgId: 'sg-0486d0f28eb585772',
    proxyEndpoint: 'zappsites-prod-proxy.proxy-cehyac2sc676.us-east-1.rds.amazonaws.com',
    dbSecretName: 'ZappsitesDatabase-prod/credentials',
  },
};

export interface AuditWorkerStackProps extends cdk.StackProps {
  stage: AuditWorkerStage;
  /** Always true for handoff — attach to API-owned queue; never create a parallel empty queue. */
  reuseExistingQueue?: boolean;
}

/**
 * Updates existing CloudFormation stack `ZappsitesAuditWorker-{stage}`.
 * Reuses SQS `zappsites-{stage}-audit-jobs` and shared RDS audits / audit_jobs.
 */
export class AuditWorkerStack extends cdk.Stack {
  readonly auditQueue: sqs.IQueue;

  constructor(scope: Construct, id: string, props: AuditWorkerStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const cfg = STAGE_CONFIG[stage];
    const reuseExistingQueue = props.reuseExistingQueue !== false;
    const account = this.account;

    if (reuseExistingQueue) {
      const queueName = `zappsites-${stage}-audit-jobs`;
      const queueArn = `arn:aws:sqs:${this.region}:${account}:${queueName}`;
      const queueUrl = `https://sqs.${this.region}.amazonaws.com/${account}/${queueName}`;
      this.auditQueue = sqs.Queue.fromQueueAttributes(this, 'AuditQueueImported', {
        queueArn,
        queueUrl,
      });
    } else {
      // Greenfield only — do not use for prod handoff.
      const deadLetterQueue = new sqs.Queue(this, 'AuditDlq', {
        queueName: `zappsites-${stage}-audit-dlq`,
        retentionPeriod: cdk.Duration.days(14),
      });
      this.auditQueue = new sqs.Queue(this, 'AuditQueue', {
        queueName: `zappsites-${stage}-audit-jobs`,
        visibilityTimeout: cdk.Duration.minutes(16),
        deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 3 },
      });
    }

    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: cfg.vpcId,
      availabilityZones: ['us-east-1a', 'us-east-1b'],
      privateSubnetIds: cfg.subnetIds,
    });

    const lambdaSg = ec2.SecurityGroup.fromSecurityGroupId(this, 'LambdaSg', cfg.lambdaSgId, {
      mutable: false,
    });

    const uploadsBucket = s3.Bucket.fromBucketName(
      this,
      'UploadsBucket',
      `zappsites-${stage}-uploads-${account}`
    );

    const dbSecret = secretsmanager.Secret.fromSecretNameV2(this, 'DbSecret', cfg.dbSecretName);

    const workerRoot = path.join(__dirname, '..', '..', 'audit-worker');

    const logGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
      logGroupName: `/aws/lambda/zappsites-${stage}-audit-worker`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const workerLambda = new lambda.DockerImageFunction(this, 'AuditWorker', {
      functionName: `zappsites-${stage}-audit-worker`,
      code: lambda.DockerImageCode.fromImageAsset(workerRoot, {
        file: 'Dockerfile.audit-worker',
      }),
      timeout: cdk.Duration.minutes(15),
      memorySize: 4096,
      architecture: lambda.Architecture.X86_64,
      vpc,
      vpcSubnets: {
        subnets: cfg.subnetIds.map((subnetId, i) =>
          ec2.Subnet.fromSubnetId(this, `PrivateSubnet${i}`, subnetId)
        ),
      },
      securityGroups: [lambdaSg],
      logGroup,
      environment: {
        NODE_ENV: stage === 'prod' ? 'production' : 'development',
        STAGE: stage,
        S3_BUCKET: uploadsBucket.bucketName,
        DB_SECRET_ARN: dbSecret.secretArn,
        DB_PROXY_ENDPOINT: cfg.proxyEndpoint,
        DB_NAME: 'zappsites',
        DB_USER: 'zappsites_admin',
      },
    });

    dbSecret.grantRead(workerLambda);
    uploadsBucket.grantReadWrite(workerLambda);
    this.auditQueue.grantConsumeMessages(workerLambda);

    workerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [dbSecret.secretArn],
      })
    );

    const geminiSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GeminiSecret',
      `Zappsites/${stage}/GEMINI_API_KEY`
    );
    // Places: prefer deploy-time GOOGLE_PLACES_API_KEY (demo key) when set; else stage secret
    const placesFromEnv = String(process.env.GOOGLE_PLACES_API_KEY || '').trim();
    const placesSecret = placesFromEnv
      ? null
      : secretsmanager.Secret.fromSecretNameV2(
          this,
          'PlacesSecret',
          `Zappsites/${stage}/GOOGLE_PLACES_API_KEY`
        );

    // Paid DataForSEO — Full Audit local-pack (prod secrets; env fallback for local synth)
    const dataForSeoLogin =
      stage === 'prod'
        ? secretsmanager.Secret.fromSecretNameV2(
            this,
            'DataForSeoLogin',
            'Zappsites/prod/DATAFORSEO_LOGIN'
          )
        : null;
    const dataForSeoPassword =
      stage === 'prod'
        ? secretsmanager.Secret.fromSecretNameV2(
            this,
            'DataForSeoPassword',
            'Zappsites/prod/DATAFORSEO_PASSWORD'
          )
        : null;

    geminiSecret.grantRead(workerLambda);
    if (placesSecret) placesSecret.grantRead(workerLambda);
    if (dataForSeoLogin) dataForSeoLogin.grantRead(workerLambda);
    if (dataForSeoPassword) dataForSeoPassword.grantRead(workerLambda);

    workerLambda.addEnvironment('GEMINI_API_KEY', geminiSecret.secretValue.unsafeUnwrap());
    if (placesFromEnv) {
      workerLambda.addEnvironment('GOOGLE_PLACES_API_KEY', placesFromEnv);
    } else if (placesSecret) {
      workerLambda.addEnvironment(
        'GOOGLE_PLACES_API_KEY',
        placesSecret.secretValue.unsafeUnwrap()
      );
    }

    if (dataForSeoLogin && dataForSeoPassword) {
      workerLambda.addEnvironment('DATAFORSEO_LOGIN', dataForSeoLogin.secretValue.unsafeUnwrap());
      workerLambda.addEnvironment(
        'DATAFORSEO_PASSWORD',
        dataForSeoPassword.secretValue.unsafeUnwrap()
      );
    } else if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
      workerLambda.addEnvironment('DATAFORSEO_LOGIN', process.env.DATAFORSEO_LOGIN);
      workerLambda.addEnvironment('DATAFORSEO_PASSWORD', process.env.DATAFORSEO_PASSWORD);
    }
    /**
     * When reusing the API-owned queue, do NOT create/update an EventSourceMapping in this stack.
     * Prod already has an Enabled mapping on zappsites-{stage}-audit-jobs; CFN previously tracked a
     * stale UUID and UPDATE 404'd. Leaving the live mapping outside CFN avoids duplicate consumers.
     */
    if (!reuseExistingQueue) {
      workerLambda.addEventSource(
        new lambdaEventSources.SqsEventSource(this.auditQueue, {
          batchSize: 1,
          reportBatchItemFailures: true,
        })
      );
    }

    new cdk.CfnOutput(this, 'AuditQueueUrl', {
      value: this.auditQueue.queueUrl,
      exportName: `${id}-AuditQueueUrl`,
    });

    new cdk.CfnOutput(this, 'WorkerFunctionName', {
      value: workerLambda.functionName,
    });

    new cdk.CfnOutput(this, 'SqsTriggerNote', {
      value: reuseExistingQueue
        ? 'Event source mapping managed outside CFN (reuse existing Enabled mapping on audit-jobs queue)'
        : 'Event source mapping created by this stack',
    });

    cdk.Tags.of(this).add('Project', 'Zappsites');
    cdk.Tags.of(this).add('OwnedBy', 'LocalSEO');
    cdk.Tags.of(this).add('Stage', stage);
  }
}
