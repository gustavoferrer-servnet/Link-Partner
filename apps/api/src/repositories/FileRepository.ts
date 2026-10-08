import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';
import type { AppUser, SupplierCoverageRecord, SupplierRecord } from '../types.js';
import { MemoryRepository } from './MemoryRepository.js';

interface PersistedState {
  suppliers: SupplierRecord[];
  supplierCoverages: SupplierCoverageRecord[];
}

export class FileRepository extends MemoryRepository {
  private readonly filePath: string;
  private readonly ready: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath = config.dataFilePath) {
    super();
    this.filePath = filePath;
    this.ready = this.load();
  }

  private async load() {
    try {
      const state = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<PersistedState>;
      if (Array.isArray(state.suppliers)) this.suppliers = state.suppliers;
      if (Array.isArray(state.supplierCoverages)) this.supplierCoverages = state.supplierCoverages;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private async persist() {
    const state: PersistedState = {
      suppliers: this.suppliers,
      supplierCoverages: this.supplierCoverages,
    };
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(state), 'utf8');
    await rename(temporaryPath, this.filePath);
  }

  private queueMutation<T>(mutation: () => Promise<T>) {
    const pending = this.writeQueue.then(async () => {
      const previousSuppliers = structuredClone(this.suppliers);
      const previousCoverages = structuredClone(this.supplierCoverages);

      try {
        const result = await mutation();
        await this.persist();
        return result;
      } catch (error) {
        this.suppliers = previousSuppliers;
        this.supplierCoverages = previousCoverages;
        throw error;
      }
    });

    // A failed disk write must not poison every subsequent persistence attempt.
    this.writeQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  override async listSuppliers(user: AppUser) {
    await this.ready;
    await this.writeQueue;
    return super.listSuppliers(user);
  }

  override async createSupplier(record: SupplierRecord, user: AppUser) {
    await this.ready;
    return this.queueMutation(() => super.createSupplier(record, user));
  }

  override async listSupplierCoverages(user: AppUser) {
    await this.ready;
    await this.writeQueue;
    return super.listSupplierCoverages(user);
  }

  override async upsertSupplierCoverage(record: SupplierCoverageRecord, user: AppUser) {
    await this.ready;
    return this.queueMutation(() => super.upsertSupplierCoverage(record, user));
  }
}
