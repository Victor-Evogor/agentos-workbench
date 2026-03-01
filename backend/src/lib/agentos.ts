import * as path from 'path';
import * as dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

dotenv.config();

type AgentOSInstance = {
  initialize: (config: unknown) => Promise<void>;
  processRequest: (input: unknown) => AsyncGenerator<any>;
  listAvailablePersonas: (userId?: string) => Promise<unknown[]>;
  listWorkflowDefinitions: () => unknown[];
};

// Mock Services
const mockAuthService = {
  validateToken: async (token: string) => ({ id: 'user-123' }),
};

const mockSubscriptionService = {
  getUserSubscription: async (userId: string) => ({ name: 'pro', level: 1, isActive: true }),
  validateAccess: async (userId: string, feature: string) => true,
};

const mockStorageAdapter = {
  run: async (sql: string, params: any) => ({ rows: [], columns: [] }),
  get: async (sql: string, params: any) => undefined,
  all: async (sql: string, params: any) => [],
  exec: async (sql: string) => {},
  close: async () => {},
  transaction: async (fn: any) => fn({
    run: async (sql: string, params: any) => ({ rows: [], columns: [] }),
    get: async (sql: string, params: any) => undefined,
    all: async (sql: string, params: any) => [],
    exec: async (sql: string) => {},
  }),
};

const mockPrisma = {} as any;

let agentosInstance: AgentOSInstance | null = null;
let initializationPromise: Promise<void> | null = null;
const runtimeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<{ AgentOS: new () => AgentOSInstance }>;

async function createAgentOS(): Promise<AgentOSInstance> {
  try {
    const module = await runtimeImport('@framers/agentos');
    return new module.AgentOS() as AgentOSInstance;
  } catch {
    const fallbackEntry = path.resolve(__dirname, '../../../../packages/agentos/dist/index.js');
    const module = await runtimeImport(pathToFileURL(fallbackEntry).href);
    return new module.AgentOS() as AgentOSInstance;
  }
}

export async function getAgentOS(): Promise<AgentOSInstance> {
  if (!agentosInstance) {
    agentosInstance = await createAgentOS();
  }
  return agentosInstance;
}

export async function initializeAgentOS() {
  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  initializationPromise = (async () => {
    console.log('Initializing AgentOS...');

    // Resolve path to personas directory relative to this file
    // Assumes this file is in src/lib/ or dist/lib/ and personas is in backend/personas
    const personasPath = path.resolve(__dirname, '../../personas');
    console.log(`Loading personas from: ${personasPath}`);

    const agentos = await getAgentOS();

    await agentos.initialize({
      authService: mockAuthService as any,
      subscriptionService: mockSubscriptionService as any,
      storageAdapter: mockStorageAdapter as any,
      prisma: mockPrisma,
      gmiManagerConfig: {
        personaLoaderConfig: {
          loaderType: 'file_system',
          personaSource: personasPath,
          personaDefinitionPath: personasPath,
        } as any,
        defaultGMIBaseConfigDefaults: {
          defaultLlmProviderId: 'openai',
          defaultLlmModelId: 'gpt-4o',
        },
      },
      orchestratorConfig: {} as any,
      promptEngineConfig: {
        defaultTemplateName: 'default',
        availableTemplates: {
          default: async (components: any) => {
            const messages = [];
            if (components.systemPrompts && components.systemPrompts.length > 0) {
              messages.push({
                role: 'system' as const,
                content: components.systemPrompts.map((p: any) => p.content).join('\n'),
              });
            }
            if (components.userInput) {
              messages.push({ role: 'user' as const, content: components.userInput });
            }
            return messages;
          },
        },
        tokenCounting: {
          strategy: 'estimated',
        },
        performance: {
          enableCaching: false,
          cacheTimeoutSeconds: 0,
        },
        historyManagement: {
          defaultMaxMessages: 10,
          maxTokensForHistory: 2048,
          summarizationTriggerRatio: 0.8,
          preserveImportantMessages: true,
        },
        contextManagement: {
          maxRAGContextTokens: 2048,
          summarizationQualityTier: 'balanced',
          preserveSourceAttributionInSummary: true,
        },
        contextualElementSelection: {
          maxElementsPerType: {},
          defaultMaxElementsPerType: 3,
          priorityResolutionStrategy: 'highest_first',
          conflictResolutionStrategy: 'skip_conflicting',
        },
      },
      toolOrchestratorConfig: {} as any,
      toolPermissionManagerConfig: {} as any,
      conversationManagerConfig: {} as any,
      streamingManagerConfig: {} as any,
      defaultPersonaId: 'default',
      modelProviderManagerConfig: {
        providers: [
          {
            providerId: 'openai',
            enabled: true,
            config: {
              apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
            },
            isDefault: true,
          },
        ],
      },
    });

    console.log('AgentOS Initialized');
  })();

  await initializationPromise;
}
