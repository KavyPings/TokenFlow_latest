import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { APPLICANTS } from '../data/applicants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MOCK_ROOT = resolve(__dirname, '..', '..', 'mock_gcs');

const gcsConfig = {
  bucket: process.env.GCS_BUCKET || '',
  useRealGcs: process.env.USE_GCS === 'true' && Boolean(process.env.GCS_BUCKET),
};

let storageClient = null;

async function getStorageClient() {
  if (!gcsConfig.useRealGcs) return null;
  if (storageClient) return storageClient;

  try {
    const { Storage } = await import('@google-cloud/storage');
    storageClient = new Storage();
    return storageClient;
  } catch (error) {
    console.warn(`[GCS] Failed to initialize @google-cloud/storage, falling back to mock storage: ${error.message}`);
    return null;
  }
}

async function ensureMockDir(pathName) {
  const fullPath = resolve(MOCK_ROOT, pathName);
  await fs.mkdir(dirname(fullPath), { recursive: true });
  return fullPath;
}

export async function readApplicantRecord(applicantId, objectPath) {
  const canonicalObjectPath = objectPath || `applicants/${applicantId}.json`;
  const storage = await getStorageClient();

  if (storage) {
    try {
      const bucket = storage.bucket(gcsConfig.bucket);
      const [fileContent] = await bucket.file(canonicalObjectPath).download();
      return {
        success: true,
        mode: 'gcs',
        objectPath: canonicalObjectPath,
        data: JSON.parse(fileContent.toString('utf-8')),
      };
    } catch (error) {
      console.warn(`[GCS] Could not read ${canonicalObjectPath} from bucket, using mock fallback: ${error.message}`);
    }
  }

  const localApplicant = APPLICANTS[applicantId] || null;
  if (!localApplicant) {
    return {
      success: false,
      mode: 'mock',
      objectPath: canonicalObjectPath,
      error: `Applicant ${applicantId} not found in fallback data`,
    };
  }

  const mockPath = await ensureMockDir(canonicalObjectPath);
  await fs.writeFile(mockPath, JSON.stringify(localApplicant, null, 2), 'utf-8');

  return {
    success: true,
    mode: 'mock',
    objectPath: canonicalObjectPath,
    data: localApplicant,
  };
}

export async function writeDecisionRecord(applicantId, objectPath, payload) {
  const canonicalObjectPath = objectPath || `decisions/${applicantId}.json`;
  const storage = await getStorageClient();
  const body = JSON.stringify(payload, null, 2);

  if (storage) {
    try {
      const bucket = storage.bucket(gcsConfig.bucket);
      const file = bucket.file(canonicalObjectPath);
      await file.save(body, {
        contentType: 'application/json',
        resumable: false,
      });

      return {
        success: true,
        mode: 'gcs',
        objectPath: canonicalObjectPath,
        bytesWritten: Buffer.byteLength(body, 'utf-8'),
      };
    } catch (error) {
      console.warn(`[GCS] Could not write ${canonicalObjectPath} to bucket, using mock fallback: ${error.message}`);
    }
  }

  const mockPath = await ensureMockDir(canonicalObjectPath);
  await fs.writeFile(mockPath, body, 'utf-8');

  return {
    success: true,
    mode: 'mock',
    objectPath: canonicalObjectPath,
    bytesWritten: Buffer.byteLength(body, 'utf-8'),
  };
}

export function getGcsStatus() {
  return {
    mode: gcsConfig.useRealGcs ? 'gcs' : 'mock',
    bucket: gcsConfig.bucket || 'mock-local',
  };
}

