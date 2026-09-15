import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
import * as fs from 'fs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';

export type Stage = 'dev' | 'prod';

export interface LocalSeoApiStackProps extends cdk.StackProps {
  stage: Stage;
}

const STAGE_CONFIG: Record<
  Stage,
  {
    vpcId: string;
    subnetIds: string[];
    lambdaSgId: string;
    proxyEndpoint: string;
    dbSecretName: string;
    clientOrigin: string;
    zappSitesOrigin: string;
  }
> = {
  dev: {
    vpcId: 'vpc-02e5014ea180674da',
    subnetIds: ['subnet-054a01f66933cf36d', 'subnet-08ae6da127b1458d4'],
    lambdaSgId: 'sg-0167438f34915d1e2',
    proxyEndpoint: 'rdsproxy.proxy-cehyac2sc676.us-east-1.rds.amazonaws.com',
    dbSecretName: 'ZappsitesDatabase-dev/credentials',
    // Local SEO staging SPA (dev branch → test.zappsites.com)
    clientOrigin: process.env.CLIENT_ORIGIN || 'https://test.zappsites.com',
    zappSitesOrigin: process.env.ZAPP_SITES_ORIGIN || 'https://staging.zappsites.com',
  },
  prod: {
    vpcId: 'vpc-00cb8c1fb56aa6e38',
    subnetIds: ['subnet-0b23b96b9b71b80fc', 'subnet-0b58a151dd40fc94e'],
    lambdaSgId: 'sg-0486d0f28eb585772',
    proxyEndpoint: 'zappsites-prod-proxy.proxy-cehyac2sc676.us-east-1.rds.amazonaws.com',
    dbSecretName: 'ZappsitesDatabase-prod/credentials',
    clientOrigin: process.env.CLIENT_ORIGIN || 'https://app.zappsites.com',
    zappSitesOrigin: process.env.ZAPP_SITES_ORIGIN || 'https://www.zappsites.com',
  },
};

export class LocalSeoApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LocalSeoApiStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const cfg = STAGE_CONFIG[stage];

    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: cfg.vpcId,
      availabilityZones: ['us-east-1a', 'us-east-1b'],
      privateSubnetIds: cfg.subnetIds,
    });

    const lambdaSg = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'LambdaSg',
      cfg.lambdaSgId,
      { mutable: false }
    );

    const dbSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'DbSecret',
      cfg.dbSecretName
    );

    const jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: `localseo-${stage}-jwt`,
      description: `Local SEO JWT signing secret (${stage})`,
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    // Shared with ZappSites Full Crawl ops routes (Phase 1 BFF).
    // Deep history + worker currently live on ZappSites prod API — use that stage's secret
    // unless ZAPP_SITES_API_BASE points at another stage.
    const zappSitesApiBase =
      (stage === 'prod'
        ? process.env.ZAPP_SITES_API_BASE_PROD
        : process.env.ZAPP_SITES_API_BASE_DEV) ||
      process.env.ZAPP_SITES_API_BASE ||
      'https://dvj0p5k5d0.execute-api.us-east-1.amazonaws.com';
    const auditOpsSecretStage = zappSitesApiBase.includes('dvj0p5k5d0') ? 'prod' : stage;
    const auditOpsSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'AuditOpsSecret',
      `Zappsites/${auditOpsSecretStage}/AUDIT_OPS_SECRET`
    );

    const backendRoot = path.join(__dirname, '..', '..');
    const assetPath = path.join(backendRoot, '.lambda-dist');
    if (!fs.existsSync(path.join(assetPath, 'dist', 'lambda.js'))) {
      throw new Error(
        `Missing ${assetPath}/dist/lambda.js — run "npm run prepare:lambda" from backend/ before cdk deploy`
      );
    }

    const logGroup = new logs.LogGroup(this, 'ApiLogs', {
      logGroupName: `/aws/lambda/localseo-api-${stage}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: stage === 'dev' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
    });

    // Stage-locked API bases (do not reuse localhost / wrong-stage API_BASE_URL from .env)
    const apiBaseUrl =
      (stage === 'prod'
        ? process.env.API_BASE_URL_PROD
        : process.env.API_BASE_URL_DEV) ||
      (stage === 'prod'
        ? 'https://zw8pq7vyi2.execute-api.us-east-1.amazonaws.com'
        : 'https://ud9zl0ww6d.execute-api.us-east-1.amazonaws.com');

    // Paid Gemini → prod only (GEMINI_API_KEY_PROD). Dev may use a separate free/test GEMINI_API_KEY.
    const geminiKey =
      stage === 'prod'
        ? process.env.GEMINI_API_KEY_PROD || ''
        : process.env.GEMINI_API_KEY || '';

    // Stripe: test keys (STRIPE_*) → LocalSeoApi-dev only; live (*_PROD) → LocalSeoApi-prod only
    const stripeSecretKey =
      stage === 'prod'
        ? process.env.STRIPE_SECRET_KEY_PROD || ''
        : process.env.STRIPE_SECRET_KEY || '';
    const stripePublishableKey =
      stage === 'prod'
        ? process.env.STRIPE_PUBLISHABLE_KEY_PROD || ''
        : process.env.STRIPE_PUBLISHABLE_KEY || '';
    const stripeWebhookSecret =
      stage === 'prod'
        ? process.env.STRIPE_WEBHOOK_SECRET_PROD || ''
        : process.env.STRIPE_WEBHOOK_SECRET || '';

    // Never use localhost GOOGLE_REDIRECT_URI from .env on Lambda
    const googleRedirectUri =
      process.env.GOOGLE_REDIRECT_URI_DEPLOY ||
      `${apiBaseUrl.replace(/\/$/, '')}/api/integrations/google/callback`;

    const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();
    const adminPasswordHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim();
    if (!adminPassword && !adminPasswordHash) {
      throw new Error(
        `Set ADMIN_PASSWORD or ADMIN_PASSWORD_HASH in backend/.env before deploying LocalSeoApi-${stage} (no hardcoded admin password).`
      );
    }

    const spaOrigins = Array.from(
      new Set(
        [
          cfg.clientOrigin,
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'https://test.zappsites.com',
          'https://app.zappsites.com',
          'https://www.zappsites.com',
          'https://staging.zappsites.com',
        ].filter(Boolean)
      )
    );

    const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      bucketName: `localseo-${stage}-media-${this.account}`,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: spaOrigins,
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: stage === 'dev' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: stage === 'dev',
    });

    mediaBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [`${mediaBucket.bucketArn}/avatars/*`, `${mediaBucket.bucketArn}/jobs/*`],
        principals: [new iam.AnyPrincipal()],
      })
    );

    const fn = new lambda.Function(this, 'ApiFn', {
      functionName: `localseo-api-${stage}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/lambda.handler',
      code: lambda.Code.fromAsset(assetPath),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: {
        subnets: cfg.subnetIds.map((subnetId, i) =>
          ec2.Subnet.fromSubnetId(this, `PrivateSubnet${i}`, subnetId)
        ),
      },
      securityGroups: [lambdaSg],
      environment: {
        STAGE: stage,
        NODE_ENV: 'production',
        SHARED_RDS: 'true',
        AUTH_REQUIRED: 'true',
        DB_SECRET_ARN: dbSecret.secretArn,
        DB_PROXY_ENDPOINT: cfg.proxyEndpoint,
        DB_NAME: 'zappsites',
        DB_USER: 'zappsites_admin',
        JWT_SECRET: jwtSecret.secretValue.unsafeUnwrap(),
        JWT_EXPIRES: process.env.JWT_EXPIRES || '7d',
        CLIENT_ORIGIN: cfg.clientOrigin,
        FRONTEND_URL: cfg.clientOrigin,
        ZAPP_SITES_ORIGIN: cfg.zappSitesOrigin,
        ZAPP_SITES_API_BASE: zappSitesApiBase,
        PAYMENT_API_URL:
          process.env.PAYMENT_API_URL ||
          (stage === 'prod'
            ? 'https://gq94idnsj0.execute-api.us-east-1.amazonaws.com'
            : 'https://gq94idnsj0.execute-api.us-east-1.amazonaws.com'),
        AUDIT_OPS_SECRET: auditOpsSecret.secretValue.unsafeUnwrap(),
        API_BASE_URL: apiBaseUrl,
        ENTITLEMENTS_DISABLED: 'false',
        MEDIA_BUCKET: mediaBucket.bucketName,
        ADMIN_EMAIL: stage === 'prod' ? 'admin@localseo.com' : 'admin@localseo.net',
        ...(adminPassword ? { ADMIN_PASSWORD: adminPassword } : {}),
        ...(adminPasswordHash ? { ADMIN_PASSWORD_HASH: adminPasswordHash } : {}),
        ...(stripeSecretKey ? { STRIPE_SECRET_KEY: stripeSecretKey } : {}),
        ...(stripePublishableKey ? { STRIPE_PUBLISHABLE_KEY: stripePublishableKey } : {}),
        ...(stripeWebhookSecret ? { STRIPE_WEBHOOK_SECRET: stripeWebhookSecret } : {}),
        STRIPE_PLATFORM_FEE_BPS: process.env.STRIPE_PLATFORM_FEE_BPS || '500',
        STRIPE_CONNECT_DEFAULT_COUNTRY: process.env.STRIPE_CONNECT_DEFAULT_COUNTRY || 'GB',
        ...(process.env.STRIPE_CONNECT_RETURN_URL
          ? { STRIPE_CONNECT_RETURN_URL: process.env.STRIPE_CONNECT_RETURN_URL }
          : {}),
        ...(process.env.STRIPE_CONNECT_REFRESH_URL
          ? { STRIPE_CONNECT_REFRESH_URL: process.env.STRIPE_CONNECT_REFRESH_URL }
          : {}),
        ...(process.env.GOOGLE_CLIENT_ID
          ? { GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID }
          : {}),
        ...(process.env.GOOGLE_CLIENT_SECRET
          ? { GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET }
          : {}),
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
          ? { GOOGLE_REDIRECT_URI: googleRedirectUri }
          : {}),
        ...(process.env.GOOGLE_PLACES_API_KEY
          ? { GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY }
          : {}),
        ...(geminiKey ? { GEMINI_API_KEY: geminiKey } : {}),
        EMAIL_TRANSPORT: 'ses',
        BOOKING_EMAIL_FROM: process.env.BOOKING_EMAIL_FROM || 'info@zappsites.com',
        SES_REGION: process.env.SES_REGION || 'us-east-1',
        ...(process.env.SMS_SENDER_ID ? { SMS_SENDER_ID: process.env.SMS_SENDER_ID } : {}),
      },
      logGroup,
    });

    dbSecret.grantRead(fn);
    jwtSecret.grantRead(fn);
    auditOpsSecret.grantRead(fn);
    mediaBucket.grantPut(fn);
    mediaBucket.grantRead(fn);

    // Allow Lambda to send booking emails through SES
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      })
    );

    // Outbound SMS via Amazon SNS (Publish to phone number)
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sns:Publish'],
        resources: ['*'],
      })
    );

    const integration = new HttpLambdaIntegration('ApiIntegration', fn);

    // Explicit origins on both stages (no wildcard) — Express CORS mirrors this list.
    const allowOrigins = spaOrigins;

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `localseo-api-${stage}`,
      description: `Local SEO Express API (${stage})`,
      corsPreflight: {
        allowHeaders: ['Authorization', 'Content-Type', 'X-Booking-Org'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins,
        maxAge: cdk.Duration.days(1),
      },
      defaultIntegration: integration,
    });

    // Stage throttling (API Gateway rate limits). Note: AWS WAF does not support
    // HTTP APIs (ApiGatewayV2) — only REST APIs — so security is Express + throttle.
    const cfnStage = httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    if (cfnStage) {
      cfnStage.defaultRouteSettings = {
        throttlingBurstLimit: stage === 'prod' ? 200 : 100,
        throttlingRateLimit: stage === 'prod' ? 50 : 25,
      };
    }

    new cdk.CfnOutput(this, 'LocalSeoMediaBucket', {
      value: mediaBucket.bucketName,
      exportName: `LocalSeoApi-${stage}-MediaBucket`,
    });

    new cdk.CfnOutput(this, 'LocalSeoApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'Local SEO HTTP API base URL',
      exportName: `LocalSeoApi-${stage}-Url`,
    });

    new cdk.CfnOutput(this, 'LocalSeoApiFunctionName', {
      value: fn.functionName,
      exportName: `LocalSeoApi-${stage}-FunctionName`,
    });
  }
}
