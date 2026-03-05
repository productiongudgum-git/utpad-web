import { Injectable, computed, signal } from '@angular/core';
import { UserRole } from '../../shared/models/auth.models';
import { environment } from '../../../environments/environment';

export type WorkerModule = 'inwarding' | 'production' | 'packing' | 'dispatch';

export interface WorkerCredential {
  id: string;
  name: string;
  phone: string;
  pin: string;
  role: UserRole;
  allowedModules: WorkerModule[];
  active: boolean;
  createdAt: string;
}

export interface OperationEvent {
  id: string;
  module: WorkerModule;
  workerId: string;
  workerName: string;
  workerRole: string;
  createdAt: string;
  batchCode: string;
  quantity: number;
  unit: string;
  summary: string;
  payload: Record<string, string | number | boolean | null>;
}

export interface SkuInventory {
  skuCode: string;
  skuName: string;
  availableUnits: number;
  reorderPoint: number;
}

export interface ModuleThroughput {
  module: WorkerModule;
  count: number;
}

export interface WorkerSessionRow {
  workerId: string;
  workerName: string;
  role: string;
  lastModule: WorkerModule | 'none';
  lastActiveAt: string;
  online: boolean;
}

export interface CommandCenterAnalytics {
  productionInHandKg: number;
  dispatchReadyUnits: number;
  wastageKg: number;
  todaysEvents: number;
  lowStockCount: number;
  reorderRiskUnits: number;
  moduleThroughput: ModuleThroughput[];
}

export interface CreateWorkerCredentialInput {
  name: string;
  phone: string;
  pin: string;
  role: UserRole;
  allowedModules: WorkerModule[];
}

export interface InwardingSubmission {
  ingredientName: string;
  quantity: number;
  unit: string;
  batchBarcode: string;
  vendorName: string;
  billNumber: string;
}

export interface ProductionSubmission {
  flavorName: string;
  batchCode: string;
  expectedYieldKg: number;
  actualOutputKg: number;
}

export interface PackingSubmission {
  batchCode: string;
  skuCode: string;
  skuName: string;
  qtyPackedKg: number;
  boxesMade: number;
  notes: string;
}

export interface DispatchSubmission {
  batchCode: string;
  qtyTakenKg: number;
  qtyDispatchedKg: number;
}

interface PersistedOpsState {
  workers: WorkerCredential[];
  events: OperationEvent[];
}

interface SubmitOperationEventRequest {
  module: WorkerModule;
  workerId: string;
  workerName: string;
  workerRole: string;
  batchCode: string;
  quantity: number;
  unit: string;
  summary: string;
  payload: Record<string, string>;
}

interface EventsApiResponse {
  events: OperationEvent[];
}

const MODULES: WorkerModule[] = ['inwarding', 'production', 'packing', 'dispatch'];
const STORAGE_KEY = 'utpad_ops_command_center_state_v2';
const CHANNEL_KEY = 'utpad_ops_command_center_channel';

const defaultWorkers: WorkerCredential[] = [
  {
    id: 'worker-inwarding-1',
    name: 'Inwarding Staff',
    phone: '9876543210',
    pin: '123456',
    role: UserRole.InwardingStaff,
    allowedModules: ['inwarding'],
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'worker-production-1',
    name: 'Production Operator',
    phone: '9876543211',
    pin: '223344',
    role: UserRole.ProductionOperator,
    allowedModules: ['production'],
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'worker-packing-1',
    name: 'Packing Staff',
    phone: '9876543212',
    pin: '112233',
    role: UserRole.PackingStaff,
    allowedModules: ['packing'],
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'worker-dispatch-1',
    name: 'Dispatch Staff',
    phone: '9876543213',
    pin: '654321',
    role: UserRole.DispatchStaff,
    allowedModules: ['dispatch'],
    active: true,
    createdAt: new Date().toISOString(),
  },
];

const defaultInventory: SkuInventory[] = [
  { skuCode: 'SKU-BOX-12', skuName: 'Mint Gum Box (12)', availableUnits: 210, reorderPoint: 120 },
  { skuCode: 'SKU-BOX-24', skuName: 'Mint Gum Box (24)', availableUnits: 84, reorderPoint: 100 },
  { skuCode: 'SKU-JAR-50', skuName: 'Gum Jar (50 pcs)', availableUnits: 62, reorderPoint: 90 },
  { skuCode: 'SKU-BLS-05', skuName: 'Blister Pack (5)', availableUnits: 155, reorderPoint: 110 },
];

@Injectable({ providedIn: 'root' })
export class OperationsLiveService {
  private readonly _workers = signal<WorkerCredential[]>(defaultWorkers);
  private readonly _events = signal<OperationEvent[]>([]);
  private readonly _skuInventory = signal<SkuInventory[]>(defaultInventory.map((item) => ({ ...item })));
  private readonly _productionInHandKg = signal(0);
  private readonly _dispatchReadyUnits = signal(defaultInventory.reduce((sum, item) => sum + item.availableUnits, 0));
  private readonly _wastageKg = signal(0);

  readonly workers = this._workers.asReadonly();
  readonly events = this._events.asReadonly();
  readonly skuInventory = this._skuInventory.asReadonly();
  readonly productionInHandKg = this._productionInHandKg.asReadonly();
  readonly dispatchReadyUnits = this._dispatchReadyUnits.asReadonly();
  readonly wastageKg = this._wastageKg.asReadonly();

  readonly lowStockSkus = computed(() =>
    this._skuInventory()
      .filter((sku) => sku.availableUnits <= sku.reorderPoint)
      .sort((a, b) => a.availableUnits - b.availableUnits),
  );

  readonly moduleThroughput = computed<ModuleThroughput[]>(() => {
    const counts = new Map<WorkerModule, number>(MODULES.map((module) => [module, 0]));
    this._events().forEach((event) => {
      counts.set(event.module, (counts.get(event.module) ?? 0) + 1);
    });
    return MODULES.map((module) => ({ module, count: counts.get(module) ?? 0 }));
  });

  readonly recentEvents = computed(() => this._events().slice(0, 25));

  readonly sessions = computed<WorkerSessionRow[]>(() => {
    const now = Date.now();
    const latestEventByWorker = new Map<string, OperationEvent>();

    this._events().forEach((event) => {
      if (!latestEventByWorker.has(event.workerId)) {
        latestEventByWorker.set(event.workerId, event);
      }
    });

    return this._workers()
      .map((worker) => {
        const latest = latestEventByWorker.get(worker.id);
        const lastActiveAt = latest?.createdAt ?? worker.createdAt;
        const online = worker.active && now - new Date(lastActiveAt).getTime() <= 10 * 60 * 1000;
        return {
          workerId: worker.id,
          workerName: worker.name,
          role: worker.role,
          lastModule: latest?.module ?? 'none',
          lastActiveAt,
          online,
        } satisfies WorkerSessionRow;
      })
      .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
  });

  readonly analytics = computed<CommandCenterAnalytics>(() => {
    const reorderRiskUnits = this.lowStockSkus().reduce((sum, sku) => sum + Math.max(sku.reorderPoint - sku.availableUnits, 0), 0);
    return {
      productionInHandKg: this._productionInHandKg(),
      dispatchReadyUnits: this._dispatchReadyUnits(),
      wastageKg: this._wastageKg(),
      todaysEvents: this.eventsTodayCount(),
      lowStockCount: this.lowStockSkus().length,
      reorderRiskUnits,
      moduleThroughput: this.moduleThroughput(),
    };
  });

  private readonly channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_KEY) : null;
  private readonly opsApiUrl = `${environment.apiBaseUrl}/ops`;
  private eventSource: EventSource | null = null;
  private syncingFromChannel = false;

  constructor() {
    this.restoreState();
    this.channel?.addEventListener('message', (message: MessageEvent<PersistedOpsState>) => {
      this.syncingFromChannel = true;
      this.applyPersistedState(message.data);
      this.syncingFromChannel = false;
    });

    void this.bootstrapFromBackend();
    this.connectEventStream();
  }

  createWorkerCredential(input: CreateWorkerCredentialInput): WorkerCredential {
    const roleDefault = this.defaultModulesForRole(input.role);
    const allowedModules = input.allowedModules.length > 0 ? input.allowedModules : roleDefault;

    const worker: WorkerCredential = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      phone: input.phone.trim(),
      pin: input.pin.trim(),
      role: input.role,
      allowedModules: this.uniqueModules(allowedModules),
      active: true,
      createdAt: new Date().toISOString(),
    };

    this._workers.update((workers) => [worker, ...workers]);
    this.persistState();
    return worker;
  }

  updateWorkerAccess(workerId: string, allowedModules: WorkerModule[]): void {
    const nextModules = this.uniqueModules(allowedModules);
    this._workers.update((workers) =>
      workers.map((worker) =>
        worker.id === workerId
          ? {
              ...worker,
              allowedModules: nextModules.length > 0 ? nextModules : worker.allowedModules,
            }
          : worker,
      ),
    );
    this.persistState();
  }

  setWorkerActive(workerId: string, active: boolean): void {
    this._workers.update((workers) =>
      workers.map((worker) => (worker.id === workerId ? { ...worker, active } : worker)),
    );
    this.persistState();
  }

  async submitInwarding(input: InwardingSubmission): Promise<OperationEvent> {
    const worker = this.resolveWorker('inwarding');
    const request: SubmitOperationEventRequest = {
      module: 'inwarding',
      workerId: worker.id,
      workerName: worker.name,
      workerRole: worker.role,
      batchCode: input.batchBarcode || 'N/A',
      quantity: Math.max(0, input.quantity),
      unit: input.unit || 'kg',
      summary: `${input.ingredientName} inwarded from ${input.vendorName}`,
      payload: {
        ingredientName: input.ingredientName,
        vendorName: input.vendorName,
        billNumber: input.billNumber,
      },
    };
    return this.publishToBackend(request);
  }

  async submitProduction(input: ProductionSubmission): Promise<OperationEvent> {
    const worker = this.resolveWorker('production');
    const expected = Math.max(0, input.expectedYieldKg);
    const actual = Math.max(0, input.actualOutputKg);
    const wastage = Math.max(0, expected - actual);
    const request: SubmitOperationEventRequest = {
      module: 'production',
      workerId: worker.id,
      workerName: worker.name,
      workerRole: worker.role,
      batchCode: input.batchCode || 'N/A',
      quantity: actual,
      unit: 'kg',
      summary: `${input.flavorName} batch processed`,
      payload: {
        expectedYieldKg: expected.toString(),
        actualOutputKg: actual.toString(),
        wastageKg: wastage.toString(),
      },
    };
    return this.publishToBackend(request);
  }

  async submitPacking(input: PackingSubmission): Promise<OperationEvent> {
    const worker = this.resolveWorker('packing');
    const boxesMade = Math.max(0, input.boxesMade);
    const request: SubmitOperationEventRequest = {
      module: 'packing',
      workerId: worker.id,
      workerName: worker.name,
      workerRole: worker.role,
      batchCode: input.batchCode || 'N/A',
      quantity: boxesMade,
      unit: 'boxes',
      summary: `${input.skuName} packed`,
      payload: {
        qtyPackedKg: Math.max(0, input.qtyPackedKg).toString(),
        skuCode: input.skuCode,
        skuName: input.skuName,
        notes: input.notes,
      },
    };
    return this.publishToBackend(request);
  }

  async submitDispatch(input: DispatchSubmission): Promise<OperationEvent> {
    const worker = this.resolveWorker('dispatch');
    const request: SubmitOperationEventRequest = {
      module: 'dispatch',
      workerId: worker.id,
      workerName: worker.name,
      workerRole: worker.role,
      batchCode: input.batchCode || 'N/A',
      quantity: Math.max(0, input.qtyDispatchedKg),
      unit: 'kg',
      summary: `Dispatch updated for batch ${input.batchCode || 'N/A'}`,
      payload: {
        qtyTakenKg: Math.max(0, input.qtyTakenKg).toString(),
        qtyDispatchedKg: Math.max(0, input.qtyDispatchedKg).toString(),
      },
    };
    return this.publishToBackend(request);
  }

  private async publishToBackend(request: SubmitOperationEventRequest): Promise<OperationEvent> {
    try {
      const response = await fetch(`${this.opsApiUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const event = (await response.json()) as OperationEvent;
      this.applyIncomingEvent(event, true);
      return event;
    } catch {
      const fallback = this.createOptimisticEvent(request);
      this.applyIncomingEvent(fallback, true);
      return fallback;
    }
  }

  private connectEventStream(): void {
    if (typeof EventSource === 'undefined') {
      return;
    }

    this.eventSource?.close();
    this.eventSource = new EventSource(`${this.opsApiUrl}/events/stream`);

    const handleMessage = (rawData: string): void => {
      try {
        const event = JSON.parse(rawData) as OperationEvent;
        this.applyIncomingEvent(event, true);
      } catch {
        // Ignore malformed stream frames.
      }
    };

    this.eventSource.addEventListener('ops-event', (event) => {
      const message = event as MessageEvent<string>;
      handleMessage(message.data);
    });

    this.eventSource.onmessage = (message: MessageEvent<string>) => {
      handleMessage(message.data);
    };
  }

  private async bootstrapFromBackend(): Promise<void> {
    try {
      const response = await fetch(`${this.opsApiUrl}/events?limit=400`);
      if (!response.ok) {
        return;
      }

      const body = (await response.json()) as EventsApiResponse;
      if (!body?.events || !Array.isArray(body.events)) {
        return;
      }

      const mergedMap = new Map<string, OperationEvent>();
      this._events().forEach((event) => mergedMap.set(event.id, event));
      body.events.forEach((event) => {
        if (this.isKnownModule(event.module) && event.id) {
          mergedMap.set(event.id, event);
        }
      });

      const merged = Array.from(mergedMap.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 400);

      this._events.set(merged);
      this.recomputeDerivedState();
      this.persistState();
    } catch {
      // Fallback to cached/local state if backend is not available.
    }
  }

  private applyIncomingEvent(event: OperationEvent, persist: boolean): void {
    if (!event || !event.id || !this.isKnownModule(event.module)) {
      return;
    }

    this._events.update((events) => {
      if (events.some((existing) => existing.id === event.id)) {
        return events;
      }

      return [event, ...events]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 400);
    });

    this.recomputeDerivedState();
    if (persist) {
      this.persistState();
    }
  }

  private recomputeDerivedState(): void {
    const inventory = defaultInventory.map((item) => ({ ...item }));
    let productionInHandKg = 0;
    let dispatchReadyUnits = inventory.reduce((sum, item) => sum + item.availableUnits, 0);
    let wastageKg = 0;

    const eventsAscending = [...this._events()].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    for (const event of eventsAscending) {
      if (event.module === 'production') {
        const actual = this.payloadNumber(event, 'actualOutputKg') ?? event.quantity;
        const expected = this.payloadNumber(event, 'expectedYieldKg') ?? actual;
        productionInHandKg += actual;
        wastageKg += Math.max(0, expected - actual);
      }

      if (event.module === 'packing') {
        const qtyPackedKg = this.payloadNumber(event, 'qtyPackedKg') ?? 0;
        productionInHandKg = Math.max(0, productionInHandKg - qtyPackedKg);
        dispatchReadyUnits += event.quantity;

        const skuCodeRaw = event.payload?.['skuCode'];
        const skuCode = typeof skuCodeRaw === 'string' ? skuCodeRaw : '';
        const sku = inventory.find((item) => item.skuCode === skuCode);
        if (sku) {
          sku.availableUnits += event.quantity;
        }
      }

      if (event.module === 'dispatch') {
        dispatchReadyUnits = Math.max(0, dispatchReadyUnits - event.quantity);
        this.consumeInventoryUnits(inventory, event.quantity);
      }
    }

    this._skuInventory.set(inventory);
    this._productionInHandKg.set(Math.max(0, productionInHandKg));
    this._dispatchReadyUnits.set(Math.max(0, dispatchReadyUnits));
    this._wastageKg.set(Math.max(0, wastageKg));
  }

  private payloadNumber(event: OperationEvent, key: string): number | null {
    const value = event.payload?.[key];
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private consumeInventoryUnits(inventory: SkuInventory[], units: number): void {
    let remaining = Math.max(0, units);
    for (const sku of inventory) {
      if (remaining <= 0) {
        break;
      }
      const consumed = Math.min(remaining, sku.availableUnits);
      sku.availableUnits -= consumed;
      remaining -= consumed;
    }
  }

  private createOptimisticEvent(request: SubmitOperationEventRequest): OperationEvent {
    return {
      id: crypto.randomUUID(),
      module: request.module,
      workerId: request.workerId,
      workerName: request.workerName,
      workerRole: request.workerRole,
      createdAt: new Date().toISOString(),
      batchCode: request.batchCode,
      quantity: request.quantity,
      unit: request.unit,
      summary: request.summary,
      payload: request.payload,
    };
  }

  private resolveWorker(module: WorkerModule): WorkerCredential {
    const worker = this._workers().find((candidate) => candidate.active && candidate.allowedModules.includes(module));
    if (worker) {
      return worker;
    }

    return {
      id: 'unassigned-worker',
      name: 'Unassigned Worker',
      phone: 'N/A',
      pin: 'N/A',
      role: UserRole.Viewer,
      allowedModules: [module],
      active: true,
      createdAt: new Date().toISOString(),
    };
  }

  private eventsTodayCount(): number {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    return this._events().filter((event) => new Date(event.createdAt).getTime() >= startMs).length;
  }

  private defaultModulesForRole(role: UserRole): WorkerModule[] {
    switch (role) {
      case UserRole.InwardingStaff:
        return ['inwarding'];
      case UserRole.ProductionOperator:
        return ['production'];
      case UserRole.PackingStaff:
        return ['packing'];
      case UserRole.DispatchStaff:
        return ['dispatch'];
      case UserRole.FactorySupervisor:
      case UserRole.TenantAdmin:
      case UserRole.PlatformAdmin:
        return [...MODULES];
      default:
        return ['inwarding'];
    }
  }

  private uniqueModules(modules: WorkerModule[]): WorkerModule[] {
    return MODULES.filter((module) => modules.includes(module));
  }

  private isKnownModule(module: string): module is WorkerModule {
    return MODULES.includes(module as WorkerModule);
  }

  private persistState(): void {
    if (this.syncingFromChannel) {
      return;
    }

    const payload: PersistedOpsState = {
      workers: this._workers(),
      events: this._events(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    this.channel?.postMessage(payload);
  }

  private restoreState(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedOpsState;
      this.applyPersistedState(parsed);
      this.recomputeDerivedState();
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private applyPersistedState(state: PersistedOpsState): void {
    if (!state || !Array.isArray(state.workers) || !Array.isArray(state.events)) {
      return;
    }

    this._workers.set(state.workers);
    this._events.set(
      state.events
        .filter((event) => this.isKnownModule(event.module))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 400),
    );
  }
}
