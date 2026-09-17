import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('./.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkStorage() {
  console.log('Checking bucket: app-releases');
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    console.error('Error listing buckets:', bucketError.message);
    return;
  }
  
  const bucket = buckets.find(b => b.name === 'app-releases');
  if (!bucket) {
    console.log('Bucket "app-releases" NOT FOUND in the list of buckets!');
    console.log('Existing buckets:', buckets.map(b => b.name).join(', '));
    return;
  }
  
  console.log('Bucket "app-releases" exists. Public:', bucket.public);
  
  const { data: files, error: filesError } = await supabase.storage.from('app-releases').list('android');
  if (filesError) {
    console.error('Error listing files:', filesError.message);
    return;
  }
  
  console.log('Files in android/:');
  console.log(files);
}

checkStorage();
