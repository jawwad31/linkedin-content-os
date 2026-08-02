const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
const envPath = 'd:/Local Work/AIXelerate/linkedin-content-os/.env.local';
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[match[1]] = val;
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  console.log('Setting up QA Data...');

  // 1. Create or get Users
  const users = [
    { email: 'agency_admin@test.com', password: 'password123', name: 'Agency Admin' },
    { email: 'client_admin@test.com', password: 'password123', name: 'Client Admin' },
    { email: 'client_user@test.com', password: 'password123', name: 'Client User' }
  ];

  const createdUsers = {};
  for (const u of users) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { name: u.name }
    });
    if (error && error.message.includes('already been registered')) {
        const { data: extUsers } = await supabase.auth.admin.listUsers();
        createdUsers[u.email] = extUsers.users.find(x => x.email === u.email);
        console.log(`User ${u.email} already exists`);
    } else if (error) {
        console.error(`Error creating user ${u.email}:`, error.message);
    } else {
        createdUsers[u.email] = data.user;
        console.log(`Created user ${u.email}`);
    }
  }

  const agencyAdmin = createdUsers['agency_admin@test.com'];
  const clientAdmin = createdUsers['client_admin@test.com'];
  const clientUser = createdUsers['client_user@test.com'];

  // 2. Ensure Profiles exist
  for (const email of Object.keys(createdUsers)) {
      const user = createdUsers[email];
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!profile) {
          await supabase.from('profiles').insert({ id: user.id, email: user.email, name: users.find(u => u.email === email).name });
      }
  }

  // 3. Create Agency
  let { data: agency } = await supabase.from('agencies').select('*').limit(1).single();
  if (!agency) {
    const res = await supabase.from('agencies').insert({ name: 'Test Agency' }).select().single();
    agency = res.data;
  }

  // 4. Add Agency Admin to agency_members
  const { data: existingAgencyMember } = await supabase.from('agency_members').select('*').eq('user_id', agencyAdmin.id).single();
  if (!existingAgencyMember) {
      await supabase.from('agency_members').insert({ agency_id: agency.id, user_id: agencyAdmin.id, role: 'agency_admin' });
  }

  // 5. Create Workspace / Client
  let { data: client1 } = await supabase.from('clients').select('*').eq('name', 'Client 1').single();
  if (!client1) {
      const res = await supabase.from('clients').insert({ agency_id: agency.id, name: 'Client 1' }).select().single();
      client1 = res.data;
  }

  let { data: client2 } = await supabase.from('clients').select('*').eq('name', 'Client 2').single();
  if (!client2) {
      const res = await supabase.from('clients').insert({ agency_id: agency.id, name: 'Client 2' }).select().single();
      client2 = res.data;
  }

  // 6. Set up client access
  // clientAdmin gets access to client1
  const { data: ca1 } = await supabase.from('client_access').select('*').eq('user_id', clientAdmin.id).eq('client_id', client1.id).single();
  if (!ca1) {
      await supabase.from('client_access').insert({ client_id: client1.id, user_id: clientAdmin.id, role: 'client_admin', invitation_status: 'accepted' });
  }

  // clientUser gets access to client1
  const { data: cu1 } = await supabase.from('client_access').select('*').eq('user_id', clientUser.id).eq('client_id', client1.id).single();
  if (!cu1) {
      await supabase.from('client_access').insert({ client_id: client1.id, user_id: clientUser.id, role: 'client_user', invitation_status: 'accepted' });
  }

  // clientAdmin gets access to client2
  const { data: ca2 } = await supabase.from('client_access').select('*').eq('user_id', clientAdmin.id).eq('client_id', client2.id).single();
  if (!ca2) {
      await supabase.from('client_access').insert({ client_id: client2.id, user_id: clientAdmin.id, role: 'client_admin', invitation_status: 'accepted' });
  }

  console.log('Data setup complete!');
}

run().catch(console.error);
