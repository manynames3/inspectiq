export const mobileConfig = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://imml0cczh7.execute-api.us-east-1.amazonaws.com",
  cognitoDomain: (process.env.EXPO_PUBLIC_COGNITO_DOMAIN ?? "").replace(/\/+$/, ""),
  cognitoClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? "",
  evaluationEnabled: (process.env.EXPO_PUBLIC_ENABLE_EVALUATION_MODE ?? "true").toLowerCase() !== "false"
};

export const oidcConfigured = Boolean(mobileConfig.cognitoDomain && mobileConfig.cognitoClientId);
