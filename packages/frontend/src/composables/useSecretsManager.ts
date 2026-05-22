// Thin composable wrapper — delegates to the Pinia secrets store.
export { useSecretsStore as useSecretsManager } from '@/stores/secretsStore';
export type { SecretsManager } from '@/stores/secretsStore';
