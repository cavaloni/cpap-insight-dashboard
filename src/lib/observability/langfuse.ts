import { Langfuse } from 'langfuse';

let langfuseClient: Langfuse | null = null;

export function getLangfuseClient(): Langfuse {
  if (!langfuseClient) {
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const baseUrl = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';

    if (!secretKey || !publicKey) {
      console.warn('Langfuse credentials not provided. Tracing will be disabled.');
      langfuseClient = new Langfuse({ enabled: false });
    } else {
      langfuseClient = new Langfuse({
        secretKey,
        publicKey,
        baseUrl,
      });
    }
  }

  return langfuseClient;
}

export async function flushLangfuse(): Promise<void> {
  if (langfuseClient) {
    await langfuseClient.shutdownAsync();
  }
}
