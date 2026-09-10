/**
 * Minimal env config for the Full Audit Docker worker.
 * Matches ZappSites worker env: STAGE, DB_*, GEMINI_API_KEY, GOOGLE_PLACES_API_KEY, S3_BUCKET.
 */
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  stage: process.env.STAGE || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  dbSecretArn: process.env.DB_SECRET_ARN || '',
  dbProxyEndpoint: process.env.DB_PROXY_ENDPOINT || '',
  dbName: process.env.DB_NAME || 'zappsites',
  dbUser: process.env.DB_USER || 'zappsites_admin',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
  s3Bucket: process.env.S3_BUCKET || '',
  isLambda: Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
} as const;
