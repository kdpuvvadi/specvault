import PocketBase from 'pocketbase';

const url = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const email = process.env.POCKETBASE_SUPERUSER_EMAIL;
const password = process.env.POCKETBASE_SUPERUSER_PASSWORD;

if (!email || !password) {
  console.error('Set POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD before running this command.');
  process.exit(1);
}

const pb = new PocketBase(url);
pb.autoCancellation(false);

const publicRead = { listRule: '', viewRule: '' };
const signedIn = '@request.auth.id != ""';
const adminOnly = '@request.auth.admin = true';

async function getOrCreate(name, definition) {
  try {
    const current = await pb.collections.getOne(name);
    console.log(`✓ ${name} already exists`);
    return current;
  } catch (error) {
    if (error.status !== 404) throw error;
    const created = await pb.collections.create({ name, ...definition });
    console.log(`+ created ${name}`);
    return created;
  }
}

async function ensureField(collection, field) {
  if (collection.fields.some((current) => current.name === field.name)) return;
  await pb.collections.update(collection.id, { fields: [...collection.fields, field] });
  console.log(`+ added ${field.name} field to ${collection.name}`);
}

async function removeField(collection, name) {
  const latest = await pb.collections.getOne(collection.id);
  if (!latest.fields.some((field) => field.name === name)) return;
  await pb.collections.update(latest.id, { fields: latest.fields.filter((field) => field.name !== name) });
  console.log(`- removed legacy ${name} field from ${latest.name}`);
}

try {
  await pb.collection('_superusers').authWithPassword(email, password);

  const users = await getOrCreate('users', {
    type: 'auth',
    listRule: adminOnly,
    viewRule: 'id = @request.auth.id || @request.auth.admin = true',
    createRule: adminOnly,
    updateRule: 'id = @request.auth.id || @request.auth.role = "admin"',
    deleteRule: adminOnly,
    passwordAuth: { enabled: true, identityFields: ['email'] },
    fields: [
      { name: 'name', type: 'text', max: 120 },
      { name: 'admin', type: 'bool' }
    ]
  });

  // Existing projects may already have a users collection from an earlier run.
  // Add the boolean permission field without touching their existing records.
  if (!users.fields.some((field) => field.name === 'admin')) {
    await pb.collections.update(users.id, {
      fields: [...users.fields, { name: 'admin', type: 'bool' }]
    });
    console.log('+ added admin field to users');
  }
  await pb.collections.update(users.id, {
    listRule: adminOnly,
    viewRule: 'id = @request.auth.id || @request.auth.admin = true',
    createRule: adminOnly,
    updateRule: 'id = @request.auth.id || @request.auth.admin = true',
    deleteRule: adminOnly
  });

  const manufacturers = await getOrCreate('manufacturers', {
    type: 'base', ...publicRead,
    createRule: adminOnly, updateRule: adminOnly, deleteRule: adminOnly,
    fields: [{ name: 'name', type: 'text', required: true, max: 160 }]
  });
  await pb.collections.update(manufacturers.id, { ...publicRead, createRule: adminOnly, updateRule: adminOnly, deleteRule: adminOnly });

  const categories = await getOrCreate('categories', {
    type: 'base', ...publicRead,
    createRule: adminOnly, updateRule: adminOnly, deleteRule: adminOnly,
    fields: [
      { name: 'name', type: 'text', required: true, max: 160 },
      { name: 'manufacturer', type: 'relation', required: true, collectionId: manufacturers.id, maxSelect: 1, cascadeDelete: true }
    ]
  });
  await pb.collections.update(categories.id, { ...publicRead, createRule: adminOnly, updateRule: adminOnly, deleteRule: adminOnly });

  const series = await getOrCreate('series', {
    type: 'base', ...publicRead,
    createRule: adminOnly, updateRule: adminOnly, deleteRule: adminOnly,
    fields: [
      { name: 'name', type: 'text', required: true, max: 160 },
      { name: 'category', type: 'relation', required: true, collectionId: categories.id, maxSelect: 1, cascadeDelete: true }
    ]
  });
  await ensureField(series, { name: 'category', type: 'relation', collectionId: categories.id, maxSelect: 1, cascadeDelete: true });
  await pb.collections.update(series.id, { ...publicRead, createRule: adminOnly, updateRule: adminOnly, deleteRule: adminOnly });

  const subsections = await getOrCreate('subsections', {
    type: 'base', ...publicRead,
    createRule: signedIn, updateRule: signedIn, deleteRule: signedIn,
    fields: [
      { name: 'title', type: 'text', required: true, max: 200 },
      { name: 'content', type: 'json' },
      { name: 'images', type: 'file', maxSelect: 99, maxSize: 10485760, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] }
    ]
  });
  await ensureField(subsections, { name: 'images', type: 'file', maxSelect: 99, maxSize: 10485760, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] });
  await pb.collections.update(subsections.id, { ...publicRead, createRule: signedIn, updateRule: signedIn, deleteRule: signedIn });

  const sections = await getOrCreate('sections', {
    type: 'base', ...publicRead,
    createRule: signedIn, updateRule: signedIn, deleteRule: signedIn,
    fields: [
      { name: 'title', type: 'text', required: true, max: 200 },
      { name: 'description', type: 'text', max: 4000 }
    ]
  });
  await pb.collections.update(sections.id, { ...publicRead, createRule: signedIn, updateRule: signedIn, deleteRule: signedIn });

  const products = await getOrCreate('products', {
    type: 'base', ...publicRead,
    createRule: adminOnly, updateRule: signedIn, deleteRule: adminOnly,
    fields: [
      { name: 'model', type: 'text', required: true, max: 200 },
      { name: 'summary', type: 'text', max: 4000 },
      { name: 'series', type: 'relation', required: true, collectionId: series.id, maxSelect: 1, cascadeDelete: true }
    ]
  });
  await pb.collections.update(products.id, { ...publicRead, createRule: adminOnly, updateRule: signedIn, deleteRule: adminOnly });

  // Child records own their parent relationship. Migrate existing reverse links first,
  // then remove the legacy relationship fields so the schema remains normalized.
  await ensureField(sections, { name: 'product', type: 'relation', collectionId: products.id, maxSelect: 1, cascadeDelete: true });
  await ensureField(subsections, { name: 'section', type: 'relation', collectionId: sections.id, maxSelect: 1, cascadeDelete: true });
  const oldProducts = await pb.collection('products').getFullList();
  for (const product of oldProducts) for (const sectionId of product.sections || []) await pb.collection('sections').update(sectionId, { product: product.id });
  const oldSections = await pb.collection('sections').getFullList();
  for (const section of oldSections) for (const subsectionId of section.subsections || []) await pb.collection('subsections').update(subsectionId, { section: section.id });
  const oldSeries = await pb.collection('series').getFullList();
  for (const seriesRecord of oldSeries) {
    if (seriesRecord.category || !seriesRecord.manufacturer) continue;
    let fallbackCategory;
    try { fallbackCategory = await pb.collection('categories').getFirstListItem(`manufacturer = '${seriesRecord.manufacturer}' && name = 'Uncategorized'`); }
    catch { fallbackCategory = await pb.collection('categories').create({ name: 'Uncategorized', manufacturer: seriesRecord.manufacturer }); }
    await pb.collection('series').update(seriesRecord.id, { category: fallbackCategory.id });
  }
  await removeField(products, 'sections');
  await removeField(sections, 'subsections');
  await removeField(series, 'manufacturer');

  console.log('\nPocketBase schema is ready. Create user records in the dashboard and enable admin for catalog administrators.');
} catch (error) {
  console.error('\nPocketBase setup failed:', error?.message || error);
  process.exit(1);
}
