import { config } from '../config.js';
import { FileRepository } from './FileRepository.js';
import { FirestoreRepository } from './FirestoreRepository.js';
import { MemoryRepository } from './MemoryRepository.js';

export const repository = config.dataBackend === 'firestore'
  ? new FirestoreRepository()
  : config.dataBackend === 'file'
    ? new FileRepository()
    : new MemoryRepository();
