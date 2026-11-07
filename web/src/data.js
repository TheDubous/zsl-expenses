import { createClient } from '@supabase/supabase-js';
import { safeFilename } from './utils.mjs';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const sb = configured ? createClient(url, key, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
export const BUCKET = 'zsl-documents';

export async function collect() {
  const names = ['trainer_profiles', 'riders', 'events', 'event_riders', 'funding_movements', 'expenses'];
  const replies = await Promise.all(names.map(name => sb.from(name).select('*')));
  const failed = replies.find(r => r.error);
  if (failed) throw failed.error;
  return Object.fromEntries(names.map((n,i)=>[n,replies[i].data]));
}

export async function saveFile(userId,eventId,expenseId,file,kind) {
  if (!file || file.size > 15 * 1024 * 1024) throw new Error('Soubor musí mít maximálně 15 MB.');
  const allowed = ['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'];
  if (!allowed.includes(file.type)) throw new Error('Podporujeme JPG, PNG, HEIC, WEBP a PDF.');
  const path = [userId,eventId,expenseId,kind + '_' + crypto.randomUUID() + '_' + safeFilename(file.name)].join('/');
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {upsert:false, contentType:file.type});
  if (error) throw error;
  return path;
}

export async function getFile(path) {
  const {data,error} = await sb.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data;
}

export async function openFile(path) {
  const {data,error} = await sb.storage.from(BUCKET).createSignedUrl(path, 90);
  if (error) throw error;
  window.open(data.signedUrl,'_blank','noopener,noreferrer');
}

export function assertOk(reply) {
  if (reply.error) throw reply.error;
  return reply.data;
}
