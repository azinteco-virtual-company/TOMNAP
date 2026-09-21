// Run after the restrictive Storage policies have been applied. This operator
// action creates only the fixed private bucket through the official Storage API.
if (process.argv.slice(2).length !== 1 || process.argv[2] !== '--create') {
  console.error(
    'Usage: UPLOAD_STORAGE_BACKEND=supabase npx tsx scripts/prepare-private-storage.ts --create'
  );
  process.exitCode = 1;
} else {
  try {
    const { preparePrivateBucket } = await import('../src/server/services/privateImageStorage');
    const result = await preparePrivateBucket();
    console.log(
      JSON.stringify({ bucket: 'tomnap-private-images', status: result, verifiedPrivate: true })
    );
  } catch {
    console.error(
      'Private bucket preparation failed. Check server credentials, Storage availability and private bucket constraints. No existing bucket was changed.'
    );
    process.exitCode = 1;
  }
}
