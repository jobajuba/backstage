/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  Entity,
  EntityPolicies,
  LocationSpec,
  LOCATION_ANNOTATION,
  ORIGIN_LOCATION_ANNOTATION,
} from '@backstage/catalog-model';
import { ConfigReader } from '@backstage/config';
import { ScmIntegrations } from '@backstage/integration';
import {
  CatalogProcessor,
  CatalogProcessorCache,
  CatalogProcessorEmit,
} from '../../ingestion/processors';
import * as results from '../../ingestion/processors/results';
import { DefaultCatalogProcessingOrchestrator } from './DefaultCatalogProcessingOrchestrator';
import { getVoidLogger } from '@backstage/backend-common';
import { defaultEntityDataParser } from '../../ingestion/processors/util/parse';

class FooBarProcessor implements CatalogProcessor {
  getProcessorName = () => 'foo-bar';

  async validateEntityKind(entity: Entity) {
    return entity.kind.toLocaleLowerCase('en-US') === 'foobar';
  }

  async postProcessEntity(
    entity: Entity,
    _location: LocationSpec,
    emit: CatalogProcessorEmit,
    cache: CatalogProcessorCache,
  ) {
    if (await cache.get('emit')) {
      emit(
        results.entity(
          { type: 'url', target: './new-place' },
          {
            apiVersion: 'my-api/v1',
            kind: 'FooBar',
            metadata: {
              name: 'my-new-foo-bar',
            },
          },
        ),
      );
      emit(
        results.relation({
          type: 'my-type',
          source: { kind: 'foobar', name: 'my-source', namespace: 'default' },
          target: { kind: 'foobar', name: 'my-target', namespace: 'default' },
        }),
      );
    }
    return entity;
  }
}

describe('DefaultCatalogProcessingOrchestrator', () => {
  const entity = {
    apiVersion: 'my-api/v1',
    kind: 'FooBar',
    metadata: {
      name: 'my-foo-bar',
      annotations: {
        [LOCATION_ANNOTATION]: 'url:./here',
        [ORIGIN_LOCATION_ANNOTATION]: 'url:./there',
      },
    },
  };

  const orchestrator = new DefaultCatalogProcessingOrchestrator({
    processors: [new FooBarProcessor()],
    integrations: ScmIntegrations.fromConfig(new ConfigReader({})),
    logger: getVoidLogger(),
    parser: defaultEntityDataParser,
    policy: EntityPolicies.allOf([]),
  });

  it('runs a minimal processing', async () => {
    await expect(orchestrator.process({ entity })).resolves.toEqual({
      ok: true,
      completedEntity: entity,
      deferredEntities: [],
      errors: [],
      relations: [],
      state: {
        cache: {},
      },
    });
  });

  it('emits some things', async () => {
    await expect(
      orchestrator.process({
        entity,
        state: { cache: { 'foo-bar': { emit: true } } },
      }),
    ).resolves.toEqual({
      ok: true,
      completedEntity: entity,
      deferredEntities: [
        {
          locationKey: 'url:./new-place',
          entity: {
            apiVersion: 'my-api/v1',
            kind: 'FooBar',
            metadata: {
              name: 'my-new-foo-bar',
              annotations: {
                [LOCATION_ANNOTATION]: 'url:./new-place',
                [ORIGIN_LOCATION_ANNOTATION]: 'url:./there',
              },
            },
          },
        },
      ],
      errors: [],
      relations: [
        {
          type: 'my-type',
          source: { kind: 'foobar', name: 'my-source', namespace: 'default' },
          target: { kind: 'foobar', name: 'my-target', namespace: 'default' },
        },
      ],
      state: {
        cache: { 'foo-bar': { emit: true } },
      },
    });
  });

  it('accepts any state input', async () => {
    await expect(
      orchestrator.process({ entity, state: null }),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      orchestrator.process({ entity, state: [] }),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      orchestrator.process({ entity, state: Symbol() as any }),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      orchestrator.process({ entity, state: undefined }),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      orchestrator.process({ entity, state: 3 }),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      orchestrator.process({ entity, state: '}{' }),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      orchestrator.process({ entity, state: { cache: null } }),
    ).resolves.toMatchObject({
      ok: true,
    });
  });
});
