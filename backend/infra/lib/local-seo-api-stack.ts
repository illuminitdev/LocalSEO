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
  }
> = {
  dev: {
    vpcId: 'vpc-02e5014ea180674da',
    subnetIds: ['subnet-054a01f66933cf36d', 'subnet-08ae6da127b1458d4'],
    lambdaSgId: 'sg-0167438f34915d1e2',
    proxyEndpoint: 'rdsproxy.proxy-cehyac2sc676.us-east-1.rds.amazonaws.com',
    dbSecretName: 'ZappsitesDatabase-dev/credentials',
    // Staging SPA on Vercel (dev branch) — override with CLIENT_ORIGIN if needed
    clientOrigin: process.env.CLIENT_ORIGIN || 'https://zappsites-local-seo.vercel.app',
  },
  prod: {
    vpcId: 'vpc-00cb8c1fb56aa6e38',
    subnetIds: ['subnet-0b23b96b9b71b80fc', 'subnet-0b58a151dd40fc94e'],
    lambdaSgId: 'sg-0486d0f28eb585772',
    proxyEndpoint: 'zappsites-prod-proxy.proxy-cehyac2sc676.us-east-1.rds.amazonaws.com',
    dbSecretName: 'ZappsitesDatabase-prod/credentials',
    clientOrigin: process.env.CLIENT_ORIGIN || 'https://app.zappsites.com',
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
        CLIENT_ORIGIN: cfg.clientOrigin,
        FRONTEND_URL: cfg.clientOrigin,
        API_BASE_URL: apiBaseUrl,
        ENTITLEMENTS_DISABLED: 'false',
        // Stage-locked admin (dev email never works on prod and vice versa)
        ADMIN_EMAIL: stage === 'prod' ? 'admin@localseo.com' : 'admin@localseo.net',
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'localseo@2026',
        // Stripe Connect — test keys on dev only; live keys via *_PROD on stage=prod (never commit)
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
        // Google Calendar OAuth (Booking → Integrations)
        ...(process.env.GOOGLE_CLIENT_ID
          ? { GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID }
          : {}),
        ...(process.env.GOOGLE_CLIENT_SECRET
          ? { GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET }
          : {}),
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
          ? { GOOGLE_REDIRECT_URI: googleRedirectUri }
          : {}),
        // Places search (both stages when key present)
        ...(process.env.GOOGLE_PLACES_API_KEY
          ? { GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY }
          : {}),
        // Gemini: paid key on prod only via GEMINI_API_KEY_PROD
        ...(geminiKey ? { GEMINI_API_KEY: geminiKey } : {}),
        // Dev-only test portal client
        ...(stage === 'dev'
          ? {
              DEV_CLIENT_EMAIL: process.env.DEV_CLIENT_EMAIL || 'client@email.com',
              DEV_CLIENT_PASSWORD: process.env.DEV_CLIENT_PASSWORD || 'client@123',
              DEV_CLIENT_PLAN_ID: process.env.DEV_CLIENT_PLAN_ID || 'complete-growth-system',
            }
          : {}),
      },
      logGroup,
    });

    dbSecret.grantRead(fn);
    jwtSecret.grantRead(fn);

    const integration = new HttpLambdaIntegration('ApiIntegration', fn);

    // Dev/staging: allow Vercel alias + previews + local Vite.
    // Prod: lock to known app / marketing origins only.
    const allowOrigins =
      stage === 'dev'
        ? ['*']
        : Array.from(
            new Set(
              [
                cfg.clientOrigin,
                'https://app.zappsites.com',
                'https://www.zappsites.com',
              ].filter(Boolean)
            )
          );

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
