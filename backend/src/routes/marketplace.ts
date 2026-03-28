import { FastifyInstance, FastifyReply } from 'fastify';

import { mockMarketplaceItems } from '../mockData';

type MarketplaceWorkbenchMode = 'demo';

type MarketplaceItemType = 'agent' | 'persona' | 'workflow' | 'extension' | 'template';

interface InstalledMarketplaceItem {
  installationId: string;
  itemId: string;
  version: string;
  status: 'installed';
  installedAt: string;
  autoUpdate: boolean;
  item: (typeof mockMarketplaceItems)[number];
}

interface MarketplaceSearchQuery {
  query?: string;
  type?: MarketplaceItemType;
  category?: string;
}

export const WORKBENCH_MARKETPLACE_MODE_HEADER = 'X-AgentOS-Workbench-Mode';

const installedItems = new Map<string, InstalledMarketplaceItem>();

function markMarketplaceReply(reply: FastifyReply, mode: MarketplaceWorkbenchMode = 'demo'): void {
  reply.header(WORKBENCH_MARKETPLACE_MODE_HEADER, mode);
}

function generateInstallationId(itemId: string): string {
  return `install-${itemId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function matchesMarketplaceQuery(
  item: (typeof mockMarketplaceItems)[number],
  filters: MarketplaceSearchQuery
): boolean {
  const query = filters.query?.trim().toLowerCase();
  const category = filters.category?.trim().toLowerCase();

  if (filters.type && item.type !== filters.type) {
    return false;
  }

  if (category && !item.categories.some((entry) => entry.toLowerCase().includes(category))) {
    return false;
  }

  if (!query) {
    return true;
  }

  return (
    item.name.toLowerCase().includes(query) ||
    item.description.toLowerCase().includes(query) ||
    item.publisher.name.toLowerCase().includes(query) ||
    item.tags.some((tag) => tag.toLowerCase().includes(query)) ||
    item.categories.some((entry) => entry.toLowerCase().includes(query))
  );
}

/**
 * Registers Marketplace routes.
 */
export default async function marketplaceRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Search marketplace.
   */
  fastify.get<{
    Querystring: MarketplaceSearchQuery;
  }>(
    '/search',
    {
      schema: {
        description: 'Search marketplace for agents, personas, workflows, and extensions',
        tags: ['Marketplace'],
        querystring: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            type: {
              type: 'string',
              enum: ['agent', 'persona', 'workflow', 'extension', 'template'],
            },
            category: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    version: { type: 'string' },
                    publisher: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        verified: { type: 'boolean' },
                      },
                    },
                    categories: { type: 'array', items: { type: 'string' } },
                    tags: { type: 'array', items: { type: 'string' } },
                    license: { type: 'string' },
                    pricing: {
                      type: 'object',
                      properties: {
                        model: { type: 'string' },
                        priceInCents: { type: 'number' },
                      },
                      required: ['model'],
                    },
                    stats: {
                      type: 'object',
                      properties: {
                        downloads: { type: 'number' },
                        activeInstalls: { type: 'number' },
                        views: { type: 'number' },
                      },
                      required: ['downloads', 'activeInstalls', 'views'],
                    },
                    ratings: {
                      type: 'object',
                      properties: {
                        average: { type: 'number' },
                        count: { type: 'number' },
                      },
                      required: ['average', 'count'],
                    },
                    iconUrl: { type: 'string' },
                  },
                },
              },
            },
            required: ['mode', 'items'],
          },
        },
      },
    },
    async (request, reply) => {
      markMarketplaceReply(reply);
      return {
        mode: 'demo' as const,
        items: mockMarketplaceItems.filter((item) => matchesMarketplaceQuery(item, request.query)),
      };
    }
  );

  /**
   * Get installed items.
   */
  fastify.get(
    '/installed',
    {
      schema: {
        description: 'List all installed marketplace items',
        tags: ['Marketplace'],
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              items: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
            },
            required: ['mode', 'items'],
          },
        },
      },
    },
    async (_request, reply) => {
      markMarketplaceReply(reply);
      return {
        mode: 'demo' as const,
        items: Array.from(installedItems.values()),
      };
    }
  );

  /**
   * Install item.
   */
  fastify.post<{
    Body: { itemId: string; version?: string };
  }>(
    '/install',
    {
      schema: {
        description: 'Install a marketplace item',
        tags: ['Marketplace'],
        body: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
            version: { type: 'string' },
          },
          required: ['itemId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              success: { type: 'boolean' },
              installation: { type: 'object', additionalProperties: true },
            },
            required: ['mode', 'success', 'installation'],
          },
          404: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
            required: ['mode', 'success', 'error'],
          },
        },
      },
    },
    async (request, reply) => {
      const item = mockMarketplaceItems.find((entry) => entry.id === request.body.itemId);

      if (!item) {
        markMarketplaceReply(reply);
        return reply.code(404).send({
          mode: 'demo',
          success: false,
          error: 'Marketplace item not found',
        });
      }

      const existingInstallation = Array.from(installedItems.values()).find(
        (installation) => installation.itemId === item.id
      );

      const installation = existingInstallation ?? {
        installationId: generateInstallationId(item.id),
        itemId: item.id,
        version: request.body.version ?? item.version,
        status: 'installed' as const,
        installedAt: new Date().toISOString(),
        autoUpdate: false,
        item,
      };

      installedItems.set(installation.installationId, installation);
      markMarketplaceReply(reply);
      return {
        mode: 'demo' as const,
        success: true,
        installation,
      };
    }
  );

  /**
   * Uninstall item.
   */
  fastify.delete<{
    Params: { installationId: string };
  }>(
    '/uninstall/:installationId',
    {
      schema: {
        description: 'Uninstall a marketplace item',
        tags: ['Marketplace'],
        params: {
          type: 'object',
          properties: {
            installationId: { type: 'string' },
          },
          required: ['installationId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              success: { type: 'boolean' },
            },
            required: ['mode', 'success'],
          },
        },
      },
    },
    async (request, reply) => {
      installedItems.delete(request.params.installationId);
      markMarketplaceReply(reply);
      return {
        mode: 'demo' as const,
        success: true,
      };
    }
  );
}
