/**
 * @fileoverview Types of the module system (kept under `modules/` while
 * the POC lives there; one exported type per file).
 *
 * @module
 */

export type { RapidModuleContext } from './Context.ts';
export type { RapidModuleEventMap } from './EventMap.ts';
export type { RapidModuleInitOptions } from './InitOptions.ts';
export type { RapidModuleInitResult } from './InitResult.ts';
export type {
  RapidModuleInstances,
  RapidModuleInstancesOf,
} from './Instances.ts';
export type { RapidModuleInvokeMiddleware } from './InvokeMiddleware.ts';
export type { RapidModuleInvokeResult } from './InvokeResult.ts';
export type { RapidModuleInvokeSeed } from './InvokeSeed.ts';
export type { RapidModulePayload } from './Payload.ts';
export type { RapidModulePayloadOf } from './PayloadOf.ts';
export type { RapidModuleSources } from './Sources.ts';
export type { RapidModuleEventPayload } from './EventPayload.ts';
