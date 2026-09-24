import {
  defineRailway,
  postgres,
  preserve,
  project,
  redis,
  service,
  volume,
} from "railway/iac";

export default defineRailway(() => {
  const applicationDeploy = {
    healthcheckPath: "/api/health",
    healthcheckTimeout: 120,
    preDeployCommand: [
      "sh -c 'if [ -d prisma ]; then npx prisma migrate deploy; else echo no-prisma-skip; fi'",
    ],
    restartPolicyMaxRetries: 3,
  };
  const Postgres = postgres("Postgres", { region: "us-west2" });
  Postgres.networking = {
    privateNetworkEndpoint: "postgres",
    tcpProxies: { "5432": {} },
  };
  const Redis = redis("Redis", { region: "us-west2" });
  Redis.deploy = {
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  };
  Redis.networking = { privateNetworkEndpoint: "redis" };
  const redisVolume = volume("redis-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 50000,
  });
  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 50000,
  });
  const web = service("web", {
    build: { builder: "DOCKERFILE", dockerfilePath: "apps/web/Dockerfile" },
    deploy: applicationDeploy,
    replicas: { "us-west2": 1 },
    env: {
      AFRISTAGE_API_BASE: preserve(),
      GIT_SHA: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      WEB_COOKIE_SECURE: preserve(),
    },
  });
  const api = service("api", {
    build: { builder: "DOCKERFILE", dockerfilePath: "apps/api/Dockerfile" },
    deploy: applicationDeploy,
    replicas: { "us-west2": 1 },
    env: {
      BETA_AUTO_APPROVE_CREATORS: preserve(),
      CDN_BASE_URL: preserve(),
      COIN_FIAT_RATES: preserve(),
      CORS_ORIGINS: preserve(),
      DATABASE_URL: preserve(),
      EMAIL_FROM: preserve(),
      ENABLE_MOCK_PAYMENTS: preserve(),
      GIT_SHA: preserve(),
      JWT_ACCESS_SECRET: preserve(),
      JWT_REFRESH_SECRET: preserve(),
      LIVEKIT_API_KEY: preserve(),
      LIVEKIT_API_SECRET: preserve(),
      LIVEKIT_URL: preserve(),
      NODE_ENV: preserve(),
      PAYSTACK_SECRET_KEY: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      REDIS_URL: preserve(),
      REQUIRE_ADMIN_MFA: preserve(),
      RESEND_API_KEY: preserve(),
      REVENUE_ALERT_WEBHOOK_URL: preserve(),
      S3_ACCESS_KEY_ID: preserve(),
      S3_BUCKET: preserve(),
      S3_ENDPOINT: preserve(),
      S3_FORCE_PATH_STYLE: preserve(),
      S3_REGION: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      STAGING_ADMIN_PASSWORD: preserve(),
      STAGING_CREATOR_PASSWORD: preserve(),
      STAGING_VIEWER_PASSWORD: preserve(),
    },
  });
  const flutterWeb = service("flutter-web", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/mobile/Dockerfile.web",
    },
    deploy: applicationDeploy,
    replicas: { "us-west2": 1 },
    env: { GIT_SHA: preserve(), RAILWAY_DOCKERFILE_PATH: preserve() },
  });
  const adminWeb = service("admin-web", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/admin-web/Dockerfile",
    },
    deploy: applicationDeploy,
    replicas: { "us-west2": 1 },
    env: {
      ADMIN_COOKIE_SECURE: preserve(),
      AFRISTAGE_API_BASE: preserve(),
      PORT: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
    },
  });

  return project("afristage", {
    resources: [
      Postgres,
      Redis,
      web,
      api,
      flutterWeb,
      adminWeb,
      redisVolume,
      postgresVolume,
    ],
  });
});
