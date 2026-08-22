// Explores: can a `@Module` class be unit-tested WITHOUT Application/
// HTTPTransport/mountModule — i.e. `new Module().method(...)` directly?
// Answer depends entirely on the metadata-only decorator design: `@GET`
// et al. never wrap the method (recordDecoration side-tables the
// metadata and returns undefined), so the method on the prototype is
// untouched — calling it directly is just... calling a method.
import {
  decorationsOf,
  GET,
  Module,
  moduleMetaOf,
  POST,
} from '../decorators/mod.ts';
import type { RapidContextResponse } from '../types/mod.ts';

@Module('Widgets', { namespace: 'widgets', prefix: '/widgets' })
class Widgets {
  private readonly store = new Map<string, { id: string; name: string }>();

  @GET('/:id:')
  find(id: string): RapidContextResponse {
    const widget = this.store.get(id);
    if (widget === undefined) {
      return { status: 404, content: { error: 'not found' } };
    }
    return { content: widget };
  }

  @POST('/')
  create(name: string): RapidContextResponse {
    const id = String(this.store.size + 1);
    const widget = { id, name };
    this.store.set(id, widget);
    return { status: 201, content: widget };
  }
}

// --- 1. Direct instantiation + direct method calls, no server at all ---
const widgets = new Widgets();

const created = widgets.create('gizmo');
console.log('create():', JSON.stringify(created));
assertEqual(created.status, 201);

const found = widgets.find((created.content as { id: string }).id);
console.log('find() [hit]:', JSON.stringify(found));
assertEqual((found.content as { name: string }).name, 'gizmo');

const missing = widgets.find('nope');
console.log('find() [miss]:', JSON.stringify(missing));
assertEqual(missing.status, 404);

// --- 2. The `bind`/`payload`/`param` binder tuple is INVISIBLE here ---
// `@POST('/', { bind: [payload(...)] })` in the blog example still
// means `create(name: string)` when called directly — binders only
// exist to translate ctx.args -> the call args at MOUNT time
// (utils/mountModule.ts). A direct unit test skips that translation
// and just passes the plain argument itself, same as any other method.

// --- 3. Decoration metadata is readable but inert without a mount ---
// Keyed by class + method NAME (the class's TC39 decorator metadata).
const findDecorations = decorationsOf(Widgets, 'find');
console.log('find() decorations:', JSON.stringify(findDecorations));
assertEqual(findDecorations?.length, 1);
assertEqual((findDecorations?.[0] as { kind: string }).kind, 'HTTP');

const meta = moduleMetaOf(Widgets);
console.log('@Module metadata:', JSON.stringify(meta));
assertEqual(meta?.namespace, 'widgets');

console.log('\nAll assertions passed — modules are plain classes; the');
console.log('decorators only add SIDE-TABLE metadata for mount(), never');
console.log('wrap the method, so unit tests need zero server/transport.');

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
  }
}
