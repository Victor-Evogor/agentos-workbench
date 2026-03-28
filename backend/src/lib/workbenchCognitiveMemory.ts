import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface WorkbenchEmbeddingRequest {
  texts: string | string[];
}

interface WorkbenchEmbeddingResponse {
  embeddings: number[][];
  usage: {
    inputTokens: number;
    totalTokens: number;
  };
  modelId: string;
  providerId: string;
}

interface WorkbenchEmbeddingManager {
  initialize(config?: unknown, providerManager?: unknown): Promise<void>;
  generateEmbeddings(request: WorkbenchEmbeddingRequest): Promise<WorkbenchEmbeddingResponse>;
  getEmbeddingModelInfo(): Promise<unknown>;
  getEmbeddingDimension(): Promise<number>;
  checkHealth(): Promise<{ isHealthy: boolean; details?: unknown }>;
  shutdown(): Promise<void>;
}

interface WorkbenchGraphConfig {
  backend?: string;
  maxDepth?: number;
  decayPerHop?: number;
  activationThreshold?: number;
  hebbianLearningRate?: number;
}

interface WorkbenchCognitiveMemoryConfig {
  featureDetectionStrategy?: string;
  workingMemoryCapacity?: number;
  tokenBudget?: number;
  encoding?: unknown;
  decay?: unknown;
  graph?: WorkbenchGraphConfig;
  infiniteContext?: unknown;
}

interface WorkbenchPersonaInput {
  cognitiveMemoryConfig?: WorkbenchCognitiveMemoryConfig;
  personalityTraits?: Record<string, unknown>;
}

interface WorkbenchFactoryInput {
  gmiInstanceId: string;
  persona: WorkbenchPersonaInput;
  workingMemory: unknown;
  userId?: string;
}

type WorkbenchCognitiveMemoryFactory = (input: WorkbenchFactoryInput) => Promise<unknown>;

interface CognitiveMemoryManagerConfig {
  workingMemory: unknown;
  knowledgeGraph: unknown;
  vectorStore: unknown;
  embeddingManager: WorkbenchEmbeddingManager;
  agentId: string;
  traits: Record<string, unknown>;
  moodProvider: () => { valence: number; arousal: number; dominance: number };
  featureDetectionStrategy?: string;
  workingMemoryCapacity?: number;
  tokenBudget?: number;
  encoding?: unknown;
  decay?: unknown;
  graph?: WorkbenchGraphConfig;
  infiniteContext?: unknown;
  maxContextTokens: number;
  collectionPrefix: string;
}

type AgentOSMemoryRuntime = {
  CognitiveMemoryManager: new () => any;
  InMemoryVectorStore: new () => any;
  KnowledgeGraph: new (config?: Record<string, unknown>) => any;
};

const runtimeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<AgentOSMemoryRuntime>;

async function loadAgentOSMemoryRuntime(): Promise<AgentOSMemoryRuntime> {
  const sourceEntry = path.resolve(__dirname, '../../../../../packages/agentos/src/index.ts');
  try {
    return await runtimeImport(pathToFileURL(sourceEntry).href);
  } catch {
    return runtimeImport('@framers/agentos');
  }
}

const WORKBENCH_EMBEDDING_DIMENSION = 128;
const WORKBENCH_EMBEDDING_MODEL_ID = 'workbench/deterministic-embeddings';

function clampVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function embedText(text: string): number[] {
  const normalized = text.toLowerCase().trim();
  const vector = new Array<number>(WORKBENCH_EMBEDDING_DIMENSION).fill(0);
  const tokens = normalized.split(/[^a-z0-9]+/g).filter(Boolean);

  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const hash = hashToken(token);
    const primaryIndex = hash % WORKBENCH_EMBEDDING_DIMENSION;
    const secondaryIndex = ((hash >>> 8) ^ token.length) % WORKBENCH_EMBEDDING_DIMENSION;
    vector[primaryIndex] += 1;
    vector[secondaryIndex] += 0.5;
  }

  return clampVector(vector);
}

class DeterministicEmbeddingManager implements WorkbenchEmbeddingManager {
  async initialize(_config?: unknown, _providerManager?: unknown): Promise<void> {}

  async generateEmbeddings(
    request: WorkbenchEmbeddingRequest
  ): Promise<WorkbenchEmbeddingResponse> {
    const texts = Array.isArray(request.texts) ? request.texts : [request.texts];
    const totalTokens = texts.reduce(
      (count: number, text: string) => count + Math.ceil(String(text ?? '').length / 4),
      0
    );
    return {
      embeddings: texts.map((text) => embedText(String(text ?? ''))),
      usage: {
        inputTokens: totalTokens,
        totalTokens,
      },
      modelId: WORKBENCH_EMBEDDING_MODEL_ID,
      providerId: 'workbench-local',
    };
  }

  async getEmbeddingModelInfo(): Promise<Record<string, unknown>> {
    return {
      modelId: WORKBENCH_EMBEDDING_MODEL_ID,
      providerId: 'workbench-local',
      dimension: WORKBENCH_EMBEDDING_DIMENSION,
      isDefault: true,
    };
  }

  async getEmbeddingDimension(): Promise<number> {
    return WORKBENCH_EMBEDDING_DIMENSION;
  }

  async checkHealth(): Promise<{ isHealthy: boolean; details?: Record<string, unknown> }> {
    return {
      isHealthy: true,
      details: {
        providerId: 'workbench-local',
        modelId: WORKBENCH_EMBEDDING_MODEL_ID,
        dimension: WORKBENCH_EMBEDDING_DIMENSION,
      },
    };
  }

  async shutdown(): Promise<void> {}
}

async function createWorkbenchMemoryManager(input: WorkbenchFactoryInput): Promise<any> {
  const runtime = await loadAgentOSMemoryRuntime();
  const { CognitiveMemoryManager, InMemoryVectorStore, KnowledgeGraph } = runtime;
  const embeddingManager = new DeterministicEmbeddingManager();
  const vectorStore = new InMemoryVectorStore();
  await vectorStore.initialize({
    id: `workbench-cogmem-${input.gmiInstanceId}`,
    type: 'in_memory',
    similarityMetric: 'cosine',
  } as any);

  const knowledgeGraph = new KnowledgeGraph({ embeddingManager });
  await knowledgeGraph.initialize();

  const manager = new CognitiveMemoryManager();
  const personaConfig = input.persona.cognitiveMemoryConfig ?? {};
  const config: CognitiveMemoryManagerConfig = {
    workingMemory: input.workingMemory,
    knowledgeGraph,
    vectorStore,
    embeddingManager,
    agentId: input.gmiInstanceId,
    traits: input.persona.personalityTraits ?? {},
    moodProvider: () => ({ valence: 0, arousal: 0, dominance: 0 }),
    featureDetectionStrategy: personaConfig.featureDetectionStrategy ?? 'keyword',
    workingMemoryCapacity: personaConfig.workingMemoryCapacity,
    tokenBudget: personaConfig.tokenBudget,
    encoding: personaConfig.encoding,
    decay: personaConfig.decay,
    graph: personaConfig.graph
      ? {
          backend: personaConfig.graph.backend ?? 'knowledge-graph',
          maxDepth: personaConfig.graph.maxDepth ?? 3,
          decayPerHop: personaConfig.graph.decayPerHop ?? 0.5,
          activationThreshold: personaConfig.graph.activationThreshold ?? 0.1,
          hebbianLearningRate: personaConfig.graph.hebbianLearningRate ?? 0.1,
        }
      : undefined,
    infiniteContext: personaConfig.infiniteContext,
    maxContextTokens: 8192,
    collectionPrefix: `workbench_${input.userId || 'anonymous'}`,
  };

  await manager.initialize(config);
  return manager;
}

export const createWorkbenchCognitiveMemoryFactory = (): WorkbenchCognitiveMemoryFactory => {
  return async (input: WorkbenchFactoryInput) => createWorkbenchMemoryManager(input);
};
