'use server';

import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Generates a random temporary password (used whenever no explicit password is supplied).
 * Never hardcode a fixed default here — it becomes a shared credential across every account.
 */
function generateTempPassword(): string {
  return crypto.randomBytes(9).toString('base64url') + 'Aa1!';
}

/**
 * Creates a new user in Supabase Auth and inserts their profile into the public.profiles table.
 * Restricted to MASTER or RH users.
 */
export async function createUserAction(
  accessToken: string,
  userData: {
    full_name: string;
    email: string;
    role: 'master' | 'rh' | 'nucleo' | 'c_level' | 'operacao' | 'operations';
    nucleo_id?: string | null;
    job_title?: string | null;
    password?: string;
  }
) {
  try {
    const adminClient = getSupabaseAdmin();

    // 1. Verify requester session
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) {
      return { success: false, error: 'Não autorizado. Sessão inválida.' };
    }

    // Check requester profile permissions
    const { data: requesterProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile || requesterProfile.status !== 'active') {
      return { success: false, error: 'Perfil do solicitante inativo ou inexistente.' };
    }

    // Validar role recebido e normalizar
    let normalizedRole = userData.role?.toLowerCase() as string;
    if (normalizedRole === 'operacao') {
      normalizedRole = 'operations';
    }

    if (!['master', 'rh', 'nucleo', 'c_level', 'operations'].includes(normalizedRole)) {
      return { success: false, code: 'ROLE_NOT_AVAILABLE', error: 'O perfil selecionado não está disponível para seleção.' };
    }

    // Validar permissão por perfil de quem cria quem
    if (normalizedRole === 'operations') {
      if (!['master', 'rh', 'c_level'].includes(requesterProfile.role)) {
        return {
          success: false,
          code: 'ROLE_ASSIGNMENT_NOT_ALLOWED',
          error: 'Seu perfil não possui permissão para cadastrar usuários com o perfil OPERAÇÕES.'
        };
      }
    } else {
      if (requesterProfile.role !== 'master' && requesterProfile.role !== 'rh') {
        return { success: false, error: 'Você não tem permissão para cadastrar usuários.' };
      }
      if (requesterProfile.role === 'rh' && normalizedRole !== 'nucleo') {
        return { success: false, error: 'RH pode cadastrar apenas usuários com perfil de acesso NÚCLEO.' };
      }
    }

    // Se cargo vier vazio
    if (!userData.job_title || !userData.job_title.trim()) {
      return { success: false, error: 'Informe o cargo/função do usuário.' };
    }

    // Validar nucleus_id baseado no role
    if (normalizedRole === 'operations' && userData.nucleo_id !== null && userData.nucleo_id !== undefined && userData.nucleo_id !== '') {
      return {
        success: false,
        code: 'OPERATIONS_USER_CANNOT_HAVE_NUCLEUS',
        error: 'O perfil OPERAÇÕES não deve possuir núcleo vinculado.'
      };
    }

    if (normalizedRole === 'nucleo' && (!userData.nucleo_id || userData.nucleo_id === '')) {
      return { success: false, error: 'Usuários do perfil NÚCLEO devem possuir núcleo vinculado.' };
    }

    // Normalizar e-mail para lowercase
    const emailLower = userData.email?.toLowerCase().trim();
    if (!emailLower) {
      return { success: false, error: 'Informe o e-mail do usuário.' };
    }

    // Verificar se já existe usuário com esse e-mail
    const { data: existingUser } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', emailLower)
      .maybeSingle();

    if (existingUser) {
      return { success: false, error: 'Já existe um usuário cadastrado com este e-mail.' };
    }

    // 2. Create the user in auth.users
    const { data: authUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: emailLower,
      password: userData.password || generateTempPassword(),
      email_confirm: true,
    });

    if (createErr || !authUser.user) {
      if (createErr?.message?.includes('already exists') || createErr?.status === 422) {
        return { success: false, error: 'Já existe um usuário cadastrado com este e-mail.' };
      }
      return { success: false, error: createErr?.message || 'Erro ao criar conta de autenticação.' };
    }

    // 3. Create profile in public.profiles
    const { error: profileCreateErr } = await adminClient
      .from('profiles')
      .insert({
        id: authUser.user.id,
        full_name: userData.full_name,
        email: emailLower,
        role: normalizedRole,
        nucleo_id: normalizedRole === 'nucleo' ? userData.nucleo_id : null,
        job_title: userData.job_title,
        status: 'active',
        first_login_required: true,
        created_by: requester.id,
      });

    if (profileCreateErr) {
      // Rollback auth user creation if profile insert fails
      await adminClient.auth.admin.deleteUser(authUser.user.id);
      return { success: false, error: `Erro ao criar perfil do usuário: ${profileCreateErr.message}` };
    }

    return { success: true, message: 'Usuário de núcleo criado com sucesso. A troca de senha será solicitada no primeiro acesso.' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro interno no servidor.' };
  }
}

/**
 * Resets a user's password and forces first_login_required to true.
 * Restricted to MASTER or RH users.
 */
export async function resetUserPasswordAction(
  accessToken: string,
  targetUserId: string,
  newPassword?: string
) {
  try {
    const adminClient = getSupabaseAdmin();

    // Verify requester
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) {
      return { success: false, error: 'Não autorizado. Sessão inválida.' };
    }

    // Check requester profile
    const { data: requesterProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile || requesterProfile.status !== 'active') {
      return { success: false, error: 'Perfil do solicitante inativo ou inexistente.' };
    }

    if (requesterProfile.role !== 'master' && requesterProfile.role !== 'rh') {
      return { success: false, error: 'Você não tem permissão para redefinir senhas.' };
    }

    // Check target user role
    const { data: targetProfile, error: targetProfileErr } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .single();

    if (targetProfileErr || !targetProfile) {
      return { success: false, error: 'Usuário de destino não encontrado.' };
    }

    // Prevent RH from resetting passwords of non-nucleo users
    if (requesterProfile.role === 'rh' && targetProfile.role !== 'nucleo') {
      return { success: false, error: 'RH tem permissão para redefinir senha apenas de usuários do perfil NÚCLEO.' };
    }

    // 2. Update password in auth
    const passwordToSet = newPassword || generateTempPassword();
    const { error: resetErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
      password: passwordToSet,
    });

    if (resetErr) {
      return { success: false, error: resetErr.message };
    }

    // 3. Update profile first_login_required = true
    const { error: profileUpdateErr } = await adminClient
      .from('profiles')
      .update({
        first_login_required: true,
        updated_by: requester.id,
      })
      .eq('id', targetUserId);

    if (profileUpdateErr) {
      return { success: false, error: 'Senha redefinida no auth, mas erro ao atualizar perfil do usuário.' };
    }

    return { success: true, message: 'Senha redefinida com sucesso. No próximo acesso, o usuário deverá alterar a senha.' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro interno no servidor.' };
  }
}

/**
 * Updates the logged in user's own password, and clears first_login_required.
 */
export async function updateOwnPasswordAction(accessToken: string, newPassword: string) {
  try {
    const adminClient = getSupabaseAdmin();

    // Verify requester
    const { data: { user }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !user) {
      return { success: false, error: 'Não autorizado. Sessão inválida.' };
    }

    // 1. Update password in auth.users
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // 2. Clear first_login_required in profile
    const { error: profileErr } = await adminClient
      .from('profiles')
      .update({
        first_login_required: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profileErr) {
      return { success: false, error: 'Senha alterada no auth, mas falha ao atualizar o perfil.' };
    }

    return { success: true, message: 'Senha alterada com sucesso!' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro interno no servidor.' };
  }
}

/**
 * Seed Initial Data (Nucleos, initial Users, functions, industries, clients, rate policies, freelancers).
 * Handled idempotently.
 */
export async function seedInitialDataAction() {
  try {
    const adminClient = getSupabaseAdmin();

    // 1. Seed Nucleos
    const nucleosToSeed = [
      { name: 'Tecnologia', code: 'NUC-TEC', head_name: 'Head de Tecnologia (Seed)', head_email: 'tech.seed@example.com' },
      { name: 'Marketing', code: 'NUC-MKT', head_name: 'Head de Marketing (Seed)', head_email: 'marketing.seed@example.com' },
      { name: 'Design & Criação', code: 'NUC-DES', head_name: 'Head de Design & Criação (Seed)', head_email: 'design.seed@example.com' },
      { name: 'Planejamento & Estratégia', code: 'NUC-PLA', head_name: 'Head de Planejamento (Seed)', head_email: 'planejamento.seed@example.com' },
      { name: 'Produção Executiva', code: 'NUC-PRO', head_name: 'Head de Produção (Seed)', head_email: 'producao.seed@example.com' },
      { name: 'Operações de Campo', code: 'NUC-OPE', head_name: 'Head de Operações (Seed)', head_email: 'operacoes.seed@example.com' },
    ];

    const nucleoIds: Record<string, string> = {};

    for (const n of nucleosToSeed) {
      const { data: existing } = await adminClient
        .from('nucleos')
        .select('id')
        .eq('name', n.name)
        .maybeSingle();

      if (existing) {
        nucleoIds[n.name] = existing.id;
      } else {
        const { data: created, error } = await adminClient
          .from('nucleos')
          .insert(n)
          .select('id')
          .single();
        
        if (!error && created) {
          nucleoIds[n.name] = created.id;
        }
      }
    }

    // 2. Seed Users
    // Each account gets its own randomly generated temp password — never a fixed/shared one.
    const usersToSeed = [
      {
        email: 'master.seed@example.com',
        password: generateTempPassword(),
        full_name: 'Diretor Master (Seed)',
        role: 'master' as const,
        first_login_required: true,
        is_seed_master: true,
        job_title: 'Diretor Master',
      },
      {
        email: 'rh.seed@example.com',
        password: generateTempPassword(),
        full_name: 'Gerente de RH (Seed)',
        role: 'rh' as const,
        first_login_required: true,
        is_seed_master: false,
        job_title: 'Gerente Operacional de RH',
      },
      {
        email: 'nucleo.design.seed@example.com',
        password: generateTempPassword(),
        full_name: 'Head de Design & Criação (Seed)',
        role: 'nucleo' as const,
        nucleo_name: 'Design & Criação',
        first_login_required: true,
        is_seed_master: false,
        job_title: 'Head de Design & Criação',
      },
    ];

    for (const u of usersToSeed) {
      const { data: existingProfile } = await adminClient
        .from('profiles')
        .select('id')
        .eq('email', u.email)
        .maybeSingle();

      if (!existingProfile) {
        // Create auth user
        const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
        });

        if (authErr || !authUser.user) {
          console.error(`Error creating auth user ${u.email}:`, authErr);
          continue;
        }

        console.log(`[Seed] Created ${u.email} with temp password: ${u.password} — troque no primeiro acesso.`);

        let nucleoId: string | null = null;
        if (u.role === 'nucleo' && u.nucleo_name) {
          nucleoId = nucleoIds[u.nucleo_name] || null;
        }

        // Create profile
        const { error: profileErr } = await adminClient
          .from('profiles')
          .insert({
            id: authUser.user.id,
            full_name: u.full_name,
            email: u.email,
            role: u.role,
            nucleo_id: nucleoId,
            job_title: u.job_title,
            status: 'active',
            first_login_required: u.first_login_required,
            is_seed_master: u.is_seed_master,
          });

        if (profileErr) {
          console.error(`Error creating profile for ${u.email}:`, profileErr);
          await adminClient.auth.admin.deleteUser(authUser.user.id);
        }
      }
    }

    // 3. Seed functions
    const functionsToSeed = [
      'Diretor de Arte', 'Designer 3D', 'Planejamento', 'Produtor Executivo', 
      'Produtor de Campo', 'Atendimento', 'Redator', 'Motion Designer', 
      'Cenógrafo', 'Conteúdo',
    ];
    const functionIds: Record<string, string> = {};
    for (const f of functionsToSeed) {
      const { data: existing } = await adminClient
        .from('freela_functions')
        .select('id')
        .eq('name', f)
        .maybeSingle();
      if (existing) {
        functionIds[f] = existing.id;
      } else {
        const { data: created } = await adminClient
          .from('freela_functions')
          .insert({ name: f })
          .select('id')
          .single();
        if (created) functionIds[f] = created.id;
      }
    }

    // 4. Seed industries
    const industriesToSeed = [
      'Automotivo', 'Bebidas', 'Tecnologia', 'Beleza', 'Entretenimento', 
      'Varejo', 'Financeiro', 'Saúde', 'Agro',
    ];
    const industryIds: Record<string, string> = {};
    for (const i of industriesToSeed) {
      const { data: existing } = await adminClient
        .from('industries')
        .select('id')
        .eq('name', i)
        .maybeSingle();
      if (existing) {
        industryIds[i] = existing.id;
      } else {
        const { data: created } = await adminClient
          .from('industries')
          .insert({ name: i })
          .select('id')
          .single();
        if (created) industryIds[i] = created.id;
      }
    }

    // 5. Seed clients
    const clientsToSeed = [
      { name: 'Monster Energy', industry: 'Bebidas' },
      { name: 'Monster Arena', industry: 'Entretenimento' },
      { name: 'AutoCorp Brasil', industry: 'Automotivo' },
      { name: 'Energy Drinks Ltd', industry: 'Bebidas' },
      { name: 'Finance Group', industry: 'Financeiro' },
      { name: 'GamerZone S.A.', industry: 'Entretenimento' },
      { name: 'Cervejaria Premium', industry: 'Bebidas' },
      { name: 'Sementes Brasil', industry: 'Agro' },
      { name: 'Glow Cosmetics', industry: 'Beleza' },
      { name: 'Core Tech', industry: 'Tecnologia' },
      { name: 'Beleza S.A.', industry: 'Beleza' },
      { name: 'AgroFest Corp', industry: 'Agro' },
    ];
    for (const c of clientsToSeed) {
      const { data: existing } = await adminClient
        .from('clients')
        .select('id')
        .eq('name', c.name)
        .maybeSingle();
      if (!existing) {
        await adminClient.from('clients').insert(c);
      }
    }

    // 6. Seed rate policies
    const ratePoliciesToSeed = [
      { function: 'Diretor de Arte', seniority: 'senior' as const, reference_value: 600, ceiling_value: 800 },
      { function: 'Designer 3D', seniority: 'senior' as const, reference_value: 700, ceiling_value: 900 },
      { function: 'Planejamento', seniority: 'pleno' as const, reference_value: 500, ceiling_value: 650 },
      { function: 'Produtor Executivo', seniority: 'senior' as const, reference_value: 800, ceiling_value: 1000 },
      { function: 'Produtor de Campo', seniority: 'pleno' as const, reference_value: 400, ceiling_value: 550 },
      { function: 'Atendimento', seniority: 'pleno' as const, reference_value: 450, ceiling_value: 600 },
      { function: 'Redator', seniority: 'pleno' as const, reference_value: 400, ceiling_value: 550 },
      { function: 'Motion Designer', seniority: 'senior' as const, reference_value: 650, ceiling_value: 850 },
      { function: 'Cenógrafo', seniority: 'especialista' as const, reference_value: 900, ceiling_value: 1200 },
      { function: 'Conteúdo', seniority: 'pleno' as const, reference_value: 400, ceiling_value: 500 },
    ];
    for (const rp of ratePoliciesToSeed) {
      const funcId = functionIds[rp.function];
      if (funcId) {
        const { data: existing } = await adminClient
          .from('rate_policies')
          .select('id')
          .eq('function_id', funcId)
          .eq('seniority', rp.seniority)
          .maybeSingle();
        if (!existing) {
          await adminClient.from('rate_policies').insert({
            function_id: funcId,
            seniority: rp.seniority,
            billing_type: 'diaria',
            reference_value: rp.reference_value,
            ceiling_value: rp.ceiling_value,
          });
        }
      }
    }

    // 7. Seed freelancers
    const freelancersToSeed = [
      { full_name: 'Carlos Silva', email: 'carlos.designer@gmail.com', whatsapp: '(11) 98765-4321', city: 'São Paulo', state: 'SP', main_function: 'Designer 3D', seniority: 'senior' as const, status: 'elegivel' as const, availability: 'disponivel' as const, reference_daily_rate: 750, average_score: 4.85, observations: 'Perfil extremamente criativo.' },
      { full_name: 'Amanda Costa', email: 'amanda.mkt@hotmail.com', whatsapp: '(21) 99123-4567', city: 'Rio de Janeiro', state: 'RJ', main_function: 'Planejamento', seniority: 'pleno' as const, status: 'elegivel' as const, availability: 'sob_consulta' as const, reference_daily_rate: 520, average_score: 4.90, observations: 'Excelente comunicação.' },
      { full_name: 'João Pedro Santos', email: 'jp.arte@v3a.com', whatsapp: '(11) 98111-2222', city: 'Campinas', state: 'SP', main_function: 'Diretor de Arte', seniority: 'senior' as const, status: 'elegivel' as const, availability: 'disponivel' as const, reference_daily_rate: 650, average_score: 4.72, observations: 'Alta produtividade.' },
      { full_name: 'Mariana Costa', email: 'mari.conteudo@v3a.com', whatsapp: '(31) 98555-6666', city: 'Belo Horizonte', state: 'MG', main_function: 'Conteúdo', seniority: 'junior' as const, status: 'em_analise' as const, availability: 'disponivel' as const, reference_daily_rate: 350, average_score: 0, observations: 'Indicada no núcleo de marketing.' },
      { full_name: 'Lucas Martins', email: 'lucas.produtor@gmail.com', whatsapp: '(21) 99666-5544', city: 'Niterói', state: 'RJ', main_function: 'Produtor Executivo', seniority: 'senior' as const, status: 'elegivel' as const, availability: 'sob_consulta' as const, reference_daily_rate: 850, average_score: 4.98, observations: 'Larga experiência.' },
      { full_name: 'Ana Paula Rosa', email: 'anapaula.atendimento@outlook.com', whatsapp: '(41) 98888-7777', city: 'Curitiba', state: 'PR', main_function: 'Atendimento', seniority: 'senior' as const, status: 'bloqueado' as const, availability: 'indisponivel' as const, reference_daily_rate: 620, average_score: 2.10, observations: 'Bloqueado por problemas.' },
      { full_name: 'Roberto Alves', email: 'roberto.alves.campo@gmail.com', whatsapp: '(11) 97777-8888', city: 'São Paulo', state: 'SP', main_function: 'Produtor de Campo', seniority: 'pleno' as const, status: 'elegivel' as const, availability: 'disponivel' as const, reference_daily_rate: 450, average_score: 4.65, observations: 'Muito proativo.' },
      { full_name: 'Fernanda Lima', email: 'fernandalima.redacao@gmail.com', whatsapp: '(51) 98122-3344', city: 'Porto Alegre', state: 'RS', main_function: 'Redator', seniority: 'pleno' as const, status: 'elegivel' as const, availability: 'disponivel' as const, reference_daily_rate: 480, average_score: 4.80, observations: 'Especialista em tom.' },
      { full_name: 'Eduardo Santos', email: 'edu.motion@v3a.com', whatsapp: '(11) 99188-3322', city: 'Santos', state: 'SP', main_function: 'Motion Designer', seniority: 'senior' as const, status: 'em_onboarding' as const, availability: 'disponivel' as const, reference_daily_rate: 680, average_score: 0, observations: 'Passando por validação.' },
      { full_name: 'Camila Alves', email: 'camila.cenografia@gmail.com', whatsapp: '(21) 98144-1122', city: 'Rio de Janeiro', state: 'RJ', main_function: 'Cenógrafo', seniority: 'especialista' as const, status: 'elegivel' as const, availability: 'sob_consulta' as const, reference_daily_rate: 1100, average_score: 4.95, observations: 'Referência no mercado.' },
      { full_name: 'Guilherme Ferreira', email: 'guilherme.f@v3a.com', whatsapp: '(11) 92345-6789', city: 'São Paulo', state: 'SP', main_function: 'Produtor de Campo', seniority: 'pleno' as const, status: 'elegivel' as const, availability: 'disponivel' as const, reference_daily_rate: 420, average_score: 4.5, observations: 'Confiável.' },
      { full_name: 'Patricia Ramos', email: 'patricia.r@v3a.com', whatsapp: '(21) 93456-7890', city: 'Niterói', state: 'RJ', main_function: 'Atendimento', seniority: 'pleno' as const, status: 'elegivel' as const, availability: 'disponivel' as const, reference_daily_rate: 480, average_score: 4.6, observations: 'Bom trato.' },
      { full_name: 'Julio Castela', email: 'julio.c@v3a.com', whatsapp: '(31) 94567-8901', city: 'Belo Horizonte', state: 'MG', main_function: 'Planejamento', seniority: 'pleno' as const, status: 'em_observacao' as const, availability: 'disponivel' as const, reference_daily_rate: 500, average_score: 3.4, observations: 'Problemas de prazo.' },
      { full_name: 'Bruna Marquez', email: 'bruna.m@v3a.com', whatsapp: '(11) 95678-9012', city: 'São Paulo', state: 'SP', main_function: 'Diretor de Arte', seniority: 'senior' as const, status: 'inativo' as const, availability: 'indisponivel' as const, reference_daily_rate: 680, average_score: 4.8, observations: 'Desligado.' },
      { full_name: 'Renato Gaúcho', email: 'renato.g@v3a.com', whatsapp: '(51) 96789-0123', city: 'Porto Alegre', state: 'RS', main_function: 'Produtor Executivo', seniority: 'senior' as const, status: 'elegivel' as const, availability: 'sob_consulta' as const, reference_daily_rate: 800, average_score: 4.7, observations: 'Muito experiente.' },
      { full_name: 'Larissa Manoela', email: 'larissa.m@v3a.com', whatsapp: '(11) 97890-1234', city: 'São Paulo', state: 'SP', main_function: 'Conteúdo', seniority: 'junior' as const, status: 'elegivel' as const, availability: 'disponivel' as const, reference_daily_rate: 320, average_score: 4.3, observations: 'Boa escrita.' },
      { full_name: 'Felipe Neto', email: 'felipe.n@v3a.com', whatsapp: '(21) 98901-2345', city: 'Rio de Janeiro', state: 'RJ', main_function: 'Redator', seniority: 'pleno' as const, status: 'elegivel' as const, availability: 'disponivel' as const, reference_daily_rate: 450, average_score: 4.5, observations: 'Revisões rápidas.' },
      { full_name: 'Gisele Bündchen', email: 'gisele.b@v3a.com', whatsapp: '(11) 99012-3456', city: 'São Paulo', state: 'SP', main_function: 'Diretor de Arte', seniority: 'especialista' as const, status: 'elegivel' as const, availability: 'sob_consulta' as const, reference_daily_rate: 1000, average_score: 4.9, observations: 'Incrível identidade.' },
      { full_name: 'Neymar Junior', email: 'neymar.j@v3a.com', whatsapp: '(13) 91234-5678', city: 'Santos', state: 'SP', main_function: 'Produtor de Campo', seniority: 'junior' as const, status: 'elegivel' as const, availability: 'disponivel' as const, reference_daily_rate: 350, average_score: 4.1, observations: 'Impulsivo.' },
      { full_name: 'Marta Vieira', email: 'marta.v@v3a.com', whatsapp: '(82) 92345-6789', city: 'Maceio', state: 'AL', main_function: 'Produtor Executivo', seniority: 'especialista' as const, status: 'elegivel' as const, availability: 'disponivel' as const, reference_daily_rate: 1200, average_score: 5.0, observations: 'A melhor.' },
    ];
    for (const f of freelancersToSeed) {
      const { data: existing } = await adminClient
        .from('freelancers')
        .select('id')
        .eq('full_name', f.full_name)
        .maybeSingle();

      if (!existing) {
        const funcId = functionIds[f.main_function] || null;
        const { data: freelaCreated, error: freelaErr } = await adminClient
          .from('freelancers')
          .insert({
            full_name: f.full_name,
            email: f.email,
            whatsapp: f.whatsapp,
            city: f.city,
            state: f.state,
            main_function_id: funcId,
            seniority: f.seniority,
            status: f.status,
            availability: f.availability,
            reference_daily_rate: f.reference_daily_rate,
            average_score: f.average_score,
            observations: f.observations,
          })
          .select('id')
          .single();

        // Seed some mock industries and skills
        if (!freelaErr && freelaCreated) {
          const mockIndName = f.main_function === 'Planejamento' ? 'Varejo' : 'Bebidas';
          const indId = industryIds[mockIndName];
          if (indId) {
            await adminClient.from('freelancer_industries').insert({
              freelancer_id: freelaCreated.id,
              industry_id: indId,
            });
          }
        }
      }
    }

    return { success: true, message: 'Seeding executado com sucesso!' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro durante o seeding.' };
  }
}

export async function createNucleoWithOptionalHeadUserAction(
  accessToken: string,
  payload: {
    nucleoName: string;
    headName: string;
    headEmail: string;
    createHeadUser: boolean;
    initialPassword?: string;
    confirmInitialPassword?: string;
  }
) {
  try {
    const adminClient = getSupabaseAdmin();

    // 1. Verify requester session
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) {
      return { success: false, error: 'Não autorizado. Sessão inválida.' };
    }

    // Check requester profile permissions
    const { data: requesterProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile || requesterProfile.status !== 'active') {
      return { success: false, error: 'Perfil do solicitante inativo ou inexistente.' };
    }

    if (requesterProfile.role !== 'master' && requesterProfile.role !== 'rh' && requesterProfile.role !== 'c_level') {
      return { success: false, error: 'Você não tem permissão para cadastrar núcleos.' };
    }

    // Validations:
    if (!payload.nucleoName || !payload.headName || !payload.headEmail) {
      return { success: false, error: 'Por favor, preencha todos os campos obrigatórios (Nome do Núcleo, Nome do Head e E-mail).' };
    }

    let existingAuthUserId: string | null = null;

    if (payload.createHeadUser) {
      if (!payload.initialPassword || !payload.confirmInitialPassword) {
        return { success: false, error: 'Por favor, preencha a senha inicial e a confirmação.' };
      }
      if (payload.initialPassword !== payload.confirmInitialPassword) {
        return { success: false, error: 'As senhas informadas não coincidem.' };
      }

      // Check if email already exists in profiles
      const { data: existingUser } = await adminClient
        .from('profiles')
        .select('role, email')
        .eq('email', payload.headEmail.trim().toLowerCase())
        .maybeSingle();

      if (existingUser) {
        return { 
          success: false, 
          error: `E-mail duplicado`, 
          emailExists: true,
          existingUserRole: existingUser.role 
        };
      }

      // Caso 3 check: Check if user exists in auth.users
      existingAuthUserId = await getAuthUserIdByEmail(adminClient, payload.headEmail);
    }

    // 2. Create the nucleo
    const { data: newNucleo, error: nucCreateErr } = await adminClient
      .from('nucleos')
      .insert({
        name: payload.nucleoName,
        head_name: payload.headName,
        head_email: payload.headEmail.trim().toLowerCase(),
        status: 'active',
        created_by: requester.id
      })
      .select('*')
      .single();

    if (nucCreateErr || !newNucleo) {
      return { success: false, error: `Erro ao criar núcleo: ${nucCreateErr?.message}` };
    }

    let profileResult = null;
    let finalHeadUserId: string | null = null;

    if (payload.createHeadUser) {
      if (existingAuthUserId) {
        // Caso 3: User already in auth.users but has no profile
        const { data: newProfile, error: profileCreateErr } = await adminClient
          .from('profiles')
          .insert({
            id: existingAuthUserId,
            full_name: payload.headName,
            email: payload.headEmail.trim().toLowerCase(),
            role: 'nucleo',
            nucleo_id: newNucleo.id,
            job_title: 'Head do Núcleo',
            status: 'active',
            first_login_required: true,
            created_by: requester.id,
          })
          .select('*')
          .single();

        if (profileCreateErr) {
          // Rollback nucleo
          await adminClient.from('nucleos').delete().eq('id', newNucleo.id);
          return { success: false, error: `Erro ao criar perfil do Head (Usuário existente): ${profileCreateErr.message}` };
        }

        profileResult = newProfile;
        finalHeadUserId = existingAuthUserId;
      } else {
        // 3. Create the user in auth.users
        const { data: authUser, error: createAuthErr } = await adminClient.auth.admin.createUser({
          email: payload.headEmail.trim().toLowerCase(),
          password: payload.initialPassword,
          email_confirm: true,
        });

        if (createAuthErr || !authUser.user) {
          // Rollback nucleo creation
          await adminClient.from('nucleos').delete().eq('id', newNucleo.id);
          return { success: false, error: `Erro ao criar usuário do Head: ${createAuthErr?.message || 'Erro desconhecido.'}` };
        }

        // 4. Create profile in public.profiles
        const { data: newProfile, error: profileCreateErr } = await adminClient
          .from('profiles')
          .insert({
            id: authUser.user.id,
            full_name: payload.headName,
            email: payload.headEmail.trim().toLowerCase(),
            role: 'nucleo',
            nucleo_id: newNucleo.id,
            job_title: 'Head do Núcleo',
            status: 'active',
            first_login_required: true,
            created_by: requester.id,
          })
          .select('*')
          .single();

        if (profileCreateErr) {
          // Rollback both auth user and nucleo
          await adminClient.auth.admin.deleteUser(authUser.user.id);
          await adminClient.from('nucleos').delete().eq('id', newNucleo.id);
          return { success: false, error: `Erro ao criar perfil do Head: ${profileCreateErr.message}` };
        }

        profileResult = newProfile;
        finalHeadUserId = authUser.user.id;
      }

      // Update nucleo with head_user_id
      if (finalHeadUserId) {
        const { error: updateNucErr } = await adminClient
          .from('nucleos')
          .update({ head_user_id: finalHeadUserId })
          .eq('id', newNucleo.id);
        
        if (!updateNucErr) {
          newNucleo.head_user_id = finalHeadUserId;
        }
      }
    }

    return {
      success: true,
      nucleo: newNucleo,
      userCreated: payload.createHeadUser && !existingAuthUserId,
      profile: profileResult,
      message: payload.createHeadUser
        ? (existingAuthUserId 
            ? 'Núcleo criado com sucesso. O perfil do Head foi associado ao usuário de autenticação já existente.'
            : 'Núcleo criado com sucesso. O usuário do Head foi cadastrado e deverá alterar a senha no primeiro acesso.')
        : 'Núcleo criado com sucesso. Nenhum usuário foi criado para o Head.'
    };

  } catch (err: any) {
    return { success: false, error: err.message || 'Erro interno no servidor.' };
  }
}

export async function createRetroactiveHeadUserAction(
  accessToken: string,
  payload: {
    nucleoId: string;
    headName: string;
    headEmail: string;
    initialPassword?: string;
    confirmInitialPassword?: string;
  }
) {
  try {
    const adminClient = getSupabaseAdmin();

    // 1. Verify requester session
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) {
      return { success: false, error: 'Não autorizado. Sessão inválida.' };
    }

    // Check requester profile permissions
    const { data: requesterProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile || requesterProfile.status !== 'active') {
      return { success: false, error: 'Perfil do solicitante inativo ou inexistente.' };
    }

    if (requesterProfile.role !== 'master' && requesterProfile.role !== 'rh' && requesterProfile.role !== 'c_level') {
      return { success: false, error: 'Você não tem permissão para cadastrar usuários.' };
    }

    // Validations:
    if (!payload.nucleoId || !payload.headName || !payload.headEmail) {
      return { success: false, error: 'Dados do núcleo e do head são obrigatórios.' };
    }

    if (!payload.initialPassword || !payload.confirmInitialPassword) {
      return { success: false, error: 'Por favor, preencha a senha inicial e a confirmação.' };
    }
    if (payload.initialPassword !== payload.confirmInitialPassword) {
      return { success: false, error: 'As senhas informadas não coincidem.' };
    }

    // Check if email already exists in profiles
    const { data: existingUser } = await adminClient
      .from('profiles')
      .select('role, email')
      .eq('email', payload.headEmail.trim().toLowerCase())
      .maybeSingle();

    if (existingUser) {
      return { 
        success: false, 
        error: `E-mail duplicado`, 
        emailExists: true,
        existingUserRole: existingUser.role 
      };
    }

    // Caso 3 check: Check if user exists in auth.users
    const existingAuthUserId = await getAuthUserIdByEmail(adminClient, payload.headEmail);

    let profileResult = null;
    let finalHeadUserId: string | null = null;

    if (existingAuthUserId) {
      // Caso 3: User already in auth.users but has no profile
      const { data: newProfile, error: profileCreateErr } = await adminClient
        .from('profiles')
        .insert({
          id: existingAuthUserId,
          full_name: payload.headName,
          email: payload.headEmail.trim().toLowerCase(),
          role: 'nucleo',
          nucleo_id: payload.nucleoId,
          job_title: 'Head do Núcleo',
          status: 'active',
          first_login_required: true,
          created_by: requester.id,
        })
        .select('*')
        .single();

      if (profileCreateErr) {
        return { success: false, error: `Erro ao criar perfil do Head (Usuário existente): ${profileCreateErr.message}` };
      }

      profileResult = newProfile;
      finalHeadUserId = existingAuthUserId;
    } else {
      // Create user in auth.users
      const { data: authUser, error: createAuthErr } = await adminClient.auth.admin.createUser({
        email: payload.headEmail.trim().toLowerCase(),
        password: payload.initialPassword,
        email_confirm: true,
      });

      if (createAuthErr || !authUser.user) {
        return { success: false, error: `Erro ao criar conta de autenticação do Head: ${createAuthErr?.message || 'Erro desconhecido.'}` };
      }

      // Create profile in public.profiles
      const { data: newProfile, error: profileCreateErr } = await adminClient
        .from('profiles')
        .insert({
          id: authUser.user.id,
          full_name: payload.headName,
          email: payload.headEmail.trim().toLowerCase(),
          role: 'nucleo',
          nucleo_id: payload.nucleoId,
          job_title: 'Head do Núcleo',
          status: 'active',
          first_login_required: true,
          created_by: requester.id,
        })
        .select('*')
        .single();

      if (profileCreateErr) {
        // Rollback auth user
        await adminClient.auth.admin.deleteUser(authUser.user.id);
        return { success: false, error: `Erro ao criar perfil do Head: ${profileCreateErr.message}` };
      }

      profileResult = newProfile;
      finalHeadUserId = authUser.user.id;
    }

    // Update nucleo with head_user_id
    if (finalHeadUserId) {
      await adminClient
        .from('nucleos')
        .update({ head_user_id: finalHeadUserId })
        .eq('id', payload.nucleoId);
    }

    return {
      success: true,
      profile: profileResult,
      message: existingAuthUserId
        ? 'Perfil do Head associado ao usuário de autenticação já existente.'
        : 'Usuário do Head criado retroativamente com sucesso.'
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro interno no servidor.' };
  }
}

/**
 * Helper to retrieve a user ID from auth.users by email.
 */
async function getAuthUserIdByEmail(adminClient: any, email: string): Promise<string | null> {
  const { data, error } = await adminClient.auth.admin.listUsers({
    perPage: 1000,
  });
  if (error || !data || !data.users) return null;
  const user = data.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
  return user ? user.id : null;
}


/**
 * Uploads a portfolio file for a freelancer to Supabase Storage.
 * Only MASTER and RH can upload.
 * Stores path, URL, and filename in the freelancers table.
 */
export async function uploadFreelancerPortfolioAction(
  accessToken: string,
  freelancerId: string,
  formData: FormData
): Promise<{ success: boolean; url?: string; path?: string; name?: string; error?: string }> {
  try {
    const adminClient = getSupabaseAdmin();

    // Verify requester
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) {
      return { success: false, error: 'Sessão inválida. Faça login novamente.' };
    }

    const { data: requesterProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile || requesterProfile.status !== 'active') {
      return { success: false, error: 'Perfil inativo ou inexistente.' };
    }

    if (requesterProfile.role !== 'master' && requesterProfile.role !== 'rh') {
      return { success: false, error: 'Apenas MASTER ou RH podem fazer upload de portfólios.' };
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, error: 'Nenhum arquivo enviado.' };
    }

    // Max 20MB
    if (file.size > 20 * 1024 * 1024) {
      return { success: false, error: 'Arquivo excede 20MB.' };
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${freelancerId}/portfolio/${timestamp}-${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: uploadData, error: uploadErr } = await adminClient.storage
      .from('freelancer-portfolios')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      return { success: false, error: `Erro no upload: ${uploadErr.message}` };
    }

    // Get a signed URL (valid 365 days) 
    const { data: signedData, error: signedErr } = await adminClient.storage
      .from('freelancer-portfolios')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

    const fileUrl = signedData?.signedUrl || '';

    // Update freelancer record
    const { error: updateErr } = await adminClient
      .from('freelancers')
      .update({
        portfolio_file_url: fileUrl,
        portfolio_file_path: storagePath,
        portfolio_file_name: file.name,
      })
      .eq('id', freelancerId);

    if (updateErr) {
      return { success: false, error: `Upload concluído mas falha ao salvar no banco: ${updateErr.message}` };
    }

    return {
      success: true,
      url: fileUrl,
      path: storagePath,
      name: file.name,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro inesperado no upload.' };
  }
}

/**
 * Updates the theme preference for the currently authenticated user profile.
 */
export async function updateThemePreferenceAction(accessToken: string, theme: string) {
  try {
    if (!['dark', 'light', 'system'].includes(theme)) {
      return { success: false, error: 'Tema inválido.' };
    }

    const adminClient = getSupabaseAdmin();
    const { data: { user }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !user) {
      return { success: false, error: 'Sessão inválida ou expirada.' };
    }

    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({ theme_preference: theme })
      .eq('id', user.id);

    if (updateErr) {
      console.error('Error updating theme preference:', updateErr);
      return { success: false, error: `Erro ao salvar preferência no banco: ${updateErr.message}` };
    }

    return { success: true, message: 'Preferência de tema salva com sucesso.' };
  } catch (err: any) {
    console.error('updateThemePreferenceAction error:', err);
    return { success: false, error: err.message || 'Erro interno no servidor.' };
  }
}

/**
 * Helper to calculate allocation days on server side
 */
function calculateDays(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 0;
  const start = new Date(startDateStr + 'T12:00:00');
  const end = new Date(endDateStr + 'T12:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? diffDays : 0;
}

/**
 * Helper to generate monthly installments reference periods and due dates
 */
function generateMonthlyInstallmentsList(startDateStr: string, endDateStr: string, preferredDueDay: number, recurringAmount: number) {
  const installments: Array<{
    installment_number: number;
    reference_period_start: string;
    reference_period_end: string;
    due_date: string;
    amount: number;
  }> = [];

  const start = new Date(startDateStr + 'T12:00:00');
  const end = new Date(endDateStr + 'T12:00:00');

  let currentStart = new Date(start);
  let installmentNum = 1;

  while (currentStart < end) {
    let idealEnd = new Date(currentStart);
    idealEnd.setMonth(idealEnd.getMonth() + 1);
    idealEnd.setDate(idealEnd.getDate() - 1);

    let currentEnd = new Date(idealEnd);
    if (currentEnd > end) {
      currentEnd = new Date(end);
    }

    let nextMonthDate = new Date(currentEnd);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    
    let dueDay = preferredDueDay;
    let tempDue = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), dueDay, 12, 0, 0);
    if (tempDue.getMonth() !== nextMonthDate.getMonth()) {
      tempDue = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0, 12, 0, 0);
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    installments.push({
      installment_number: installmentNum++,
      reference_period_start: formatDate(currentStart),
      reference_period_end: formatDate(currentEnd),
      due_date: formatDate(tempDue),
      amount: recurringAmount
    });

    let nextStart = new Date(currentEnd);
    nextStart.setDate(nextStart.getDate() + 1);
    currentStart = nextStart;
  }

  return installments;
}

/**
 * Helper to update payment_request_status on allocations table
 */
async function updateAllocationPaymentStatus(adminClient: any, allocationId: string) {
  const { data: schedules } = await adminClient
    .from('allocation_payment_schedules')
    .select('status')
    .eq('allocation_id', allocationId);

  if (!schedules || schedules.length === 0) return;

  const total = schedules.length;
  const pending = schedules.filter((s: any) => s.status === 'pending').length;
  const paid = schedules.filter((s: any) => s.status === 'paid').length;
  const generated = schedules.filter((s: any) => s.status !== 'pending' && s.status !== 'cancelled').length;

  let aggregatedStatus = 'not_requested';
  if (paid === total) {
    aggregatedStatus = 'completed';
  } else if (generated === total) {
    aggregatedStatus = 'requested';
  } else if (generated > 0) {
    aggregatedStatus = 'partially_requested';
  }

  await adminClient
    .from('allocations')
    .update({ payment_request_status: aggregatedStatus })
    .eq('id', allocationId);
}

/**
 * Action to confirm freelancer allocation to a job request, creating payment schedules.
 */
export async function confirmAllocationAction(
  accessToken: string,
  payload: {
    requestId: string;
    freelancerId: string;
    negotiatedRate: number;
    remunerationModel: string; // 'Diária', 'Hora', 'Job Fechado'
    scope: string;
    paymentModel: 'one_time' | 'monthly_recurring' | 'milestone';
    contractStartDate?: string;
    contractEndDate?: string;
    recurringAmount?: number;
    preferredDueDay?: number;
    paymentTerms?: string;
    paymentNotes?: string;
    excludedDates?: string[];
    // Success Fee Fields
    successFeeEnabled?: boolean;
    successFeeType?: 'fixed' | 'percentage';
    successFeeFixedAmount?: number;
    successFeePercent?: number;
    successFeeBase?: string;
    successFeeTrigger?: string;
    successFeeTerms?: string;
    acceptedByFreelancer?: boolean;
  }
) {
  try {
    const adminClient = getSupabaseAdmin();

    // 1. Verify requester session
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) {
      return { success: false, error: 'Não autorizado. Sessão inválida.' };
    }

    // Check requester profile permissions
    const { data: requesterProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status, nucleo_id')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile || requesterProfile.status !== 'active') {
      return { success: false, error: 'Perfil do solicitante inativo ou inexistente.' };
    }

    if (requesterProfile.role === 'rh') {
      return { success: false, error: 'Usuários do RH não podem homologar ou editar alocações.' };
    }

    // Fetch job request & job details
    const { data: reqData, error: reqDataErr } = await adminClient
      .from('job_freelancer_requests')
      .select(`
        id,
        job_id,
        budget_max,
        calculated_days,
        allocation_id,
        jobs (
          id,
          nucleo_id,
          start_date,
          end_date
        )
      `)
      .eq('id', payload.requestId)
      .single();

    if (reqDataErr || !reqData) {
      return { success: false, error: 'Job request não encontrado.' };
    }

    const job = (reqData as any).jobs;
    if (!job) {
      return { success: false, error: 'Job correspondente não encontrado.' };
    }

    // Block if job already booked
    if (reqData.allocation_id) {
      return { success: false, error: 'Este job já possui uma alocação activa.' };
    }

    // Check nucleus matching
    if (requesterProfile.role === 'nucleo' && requesterProfile.nucleo_id !== job.nucleo_id) {
      return { success: false, error: 'Você não tem permissão para homologar jobs de outro núcleo.' };
    }

    // Fetch candidate
    const { data: candidate, error: candErr } = await adminClient
      .from('shortlist_candidates')
      .select('id, policy_status, schedule_conflict, requires_rh_approval, requires_head_approval, estimated_hours')
      .eq('request_id', payload.requestId)
      .eq('freelancer_id', payload.freelancerId)
      .single();

    if (candErr || !candidate) {
      return { success: false, error: 'Candidato não encontrado na shortlist.' };
    }

    // Calculate dates
    const start_date = payload.contractStartDate || job.start_date;
    const end_date = payload.contractEndDate || job.end_date;

    // Calculate negotiated total & savings
    let negotiatedTotal = 0;
    const model = payload.remunerationModel?.toLowerCase() || '';
    if (model === 'diária' || model === 'diaria') {
      const days = calculateDays(start_date, end_date);
      negotiatedTotal = payload.negotiatedRate * (days || 1);
    } else if (model === 'hora') {
      negotiatedTotal = payload.negotiatedRate * (candidate.estimated_hours || 0);
    } else {
      negotiatedTotal = payload.negotiatedRate;
    }

    let totalContractValue = payload.paymentModel === 'monthly_recurring'
      ? (() => {
          let list = generateMonthlyInstallmentsList(start_date, end_date, payload.preferredDueDay || 5, payload.recurringAmount || payload.negotiatedRate);
          if (payload.excludedDates && payload.excludedDates.length > 0) {
            list = list.filter(inst => !payload.excludedDates?.includes(inst.due_date));
          }
          return list.reduce((sum, inst) => sum + inst.amount, 0);
        })()
      : negotiatedTotal;

    const budgetSavingAmount = Number(reqData.budget_max || 0) - totalContractValue;
    const budgetSavingPercentage = reqData.budget_max > 0 ? (budgetSavingAmount / reqData.budget_max) * 100 : 0;
    const budgetDeltaStatus = budgetSavingAmount > 0 ? 'saving' : budgetSavingAmount === 0 ? 'neutral' : 'over_budget';

    const modelDb = 
      payload.remunerationModel?.toLowerCase() === 'diária' || payload.remunerationModel?.toLowerCase() === 'diaria' || payload.remunerationModel === 'daily' ? 'daily' :
      payload.remunerationModel?.toLowerCase() === 'hora' || payload.remunerationModel === 'hourly' ? 'hourly' :
      payload.remunerationModel?.toLowerCase() === 'job fechado' || payload.remunerationModel === 'fixed_job' ? 'fixed_job' : 'monthly_salary';

    // 1. Fetch or create negotiation record
    const { data: existingNeg } = await adminClient
      .from('negotiations')
      .select('id')
      .eq('request_id', payload.requestId)
      .eq('freelancer_id', payload.freelancerId)
      .maybeSingle();

    let negotiationId = existingNeg?.id;
    if (!negotiationId) {
      const { data: createdNeg, error: createdNegErr } = await adminClient
        .from('negotiations')
        .insert({
          job_id: reqData.job_id,
          request_id: payload.requestId,
          freelancer_id: payload.freelancerId,
          scope: payload.scope || 'Alocação homologada pelo núcleo',
          negotiated_value: payload.negotiatedRate,
          billing_type: modelDb,
          status: 'aceitou'
        })
        .select('id')
        .single();
      if (!createdNegErr && createdNeg) {
        negotiationId = createdNeg.id;
      }
    }

    // 2. Persist success fee settings if applicable
    if (payload.successFeeEnabled && negotiationId) {
      let calculatedPotentialAmount = 0;
      if (payload.successFeeType === 'fixed') {
        calculatedPotentialAmount = payload.successFeeFixedAmount || 0;
      } else {
        const baseForCalc = payload.successFeeBase === 'sobre o budget' ? Number(reqData.budget_max || 0) : totalContractValue;
        calculatedPotentialAmount = (baseForCalc * (payload.successFeePercent || 0)) / 100;
      }

      const { data: existingNSF } = await adminClient
        .from('negotiation_success_fees')
        .select('id')
        .eq('negotiation_id', negotiationId)
        .maybeSingle();

      if (existingNSF) {
        await adminClient
          .from('negotiation_success_fees')
          .update({
            enabled: true,
            fee_type: payload.successFeeType,
            fixed_amount: payload.successFeeFixedAmount || 0,
            percentage_rate: payload.successFeePercent || 0,
            percentage_base: payload.successFeeBase,
            calculated_potential_amount: calculatedPotentialAmount,
            trigger_type: payload.successFeeTrigger,
            terms: payload.successFeeTerms,
            accepted_by_freelancer: payload.acceptedByFreelancer || false,
            accepted_at: payload.acceptedByFreelancer ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingNSF.id);
      } else {
        await adminClient
          .from('negotiation_success_fees')
          .insert({
            negotiation_id: negotiationId,
            enabled: true,
            fee_type: payload.successFeeType,
            fixed_amount: payload.successFeeFixedAmount || 0,
            percentage_rate: payload.successFeePercent || 0,
            percentage_base: payload.successFeeBase,
            calculated_potential_amount: calculatedPotentialAmount,
            trigger_type: payload.successFeeTrigger,
            terms: payload.successFeeTerms,
            accepted_by_freelancer: payload.acceptedByFreelancer || false,
            accepted_at: payload.acceptedByFreelancer ? new Date().toISOString() : null
          });
      }
    }

    // Insert Allocation
    const { data: newAlloc, error: allocCreateErr } = await adminClient
      .from('allocations')
      .insert({
        job_id: reqData.job_id,
        request_id: payload.requestId,
        freelancer_id: payload.freelancerId,
        nucleo_id: job.nucleo_id,
        negotiation_id: negotiationId || null,
        start_date,
        end_date,
        approved_value: payload.negotiatedRate,
        status: 'booked',
        created_by: requester.id,
        negotiated_total: negotiatedTotal,
        budget_saving_amount: budgetSavingAmount,
        budget_saving_percentage: budgetSavingPercentage,
        budget_delta_status: budgetDeltaStatus,
        payment_model: payload.paymentModel,
        contract_start_date: start_date,
        contract_end_date: end_date,
        recurrence_frequency: payload.paymentModel === 'monthly_recurring' ? 'monthly' : 'none',
        recurring_amount: payload.paymentModel === 'monthly_recurring' ? (payload.recurringAmount || payload.negotiatedRate) : null,
        total_contract_value: totalContractValue,
        payment_terms: payload.paymentTerms || '',
        payment_notes: payload.paymentNotes || '',
        payment_request_status: 'not_requested',
        evaluation_status: 'locked',
        reverse_evaluation_status: 'not_generated',
        success_fee_enabled: payload.successFeeEnabled || false
      })
      .select('id, allocation_code')
      .single();

    if (allocCreateErr || !newAlloc) {
      console.error('Error inserting allocation:', allocCreateErr);
      return { success: false, error: `Erro ao criar alocação: ${allocCreateErr?.message}` };
    }

    // Generate Payment Installments in schedule
    if (payload.paymentModel === 'monthly_recurring') {
      const preferredDueDay = payload.preferredDueDay || 5;
      const recurringAmount = payload.recurringAmount || payload.negotiatedRate;
      
      let installments = generateMonthlyInstallmentsList(start_date, end_date, preferredDueDay, recurringAmount);
      if (payload.excludedDates && payload.excludedDates.length > 0) {
        installments = installments.filter(inst => !payload.excludedDates?.includes(inst.due_date));
      }
      
      let currentNumber = 1;
      for (const inst of installments) {
        const { error: instErr } = await adminClient
          .from('allocation_payment_schedules')
          .insert({
            allocation_id: newAlloc.id,
            job_id: reqData.job_id,
            freelancer_id: payload.freelancerId,
            nucleo_id: job.nucleo_id,
            installment_number: currentNumber,
            payment_number: currentNumber,
            total_payments: installments.length,
            reference_period_start: inst.reference_period_start,
            reference_period_end: inst.reference_period_end,
            due_date: inst.due_date,
            amount: inst.amount,
            remuneration_model: modelDb,
            status: 'pending'
          });

        if (instErr) {
          console.error('Error generating installment schedule:', instErr);
        }
        currentNumber++;
      }
    } else {
      const preferredDueDay = payload.preferredDueDay || 5;
      let due_date = end_date;
      if (end_date) {
        const endD = new Date(end_date + 'T12:00:00');
        endD.setMonth(endD.getMonth() + 1);
        let tempDue = new Date(endD.getFullYear(), endD.getMonth(), preferredDueDay, 12, 0, 0);
        if (tempDue.getMonth() !== endD.getMonth()) {
          tempDue = new Date(endD.getFullYear(), endD.getMonth() + 1, 0, 12, 0, 0);
        }
        const pad = (n: number) => String(n).padStart(2, '0');
        due_date = `${tempDue.getFullYear()}-${pad(tempDue.getMonth() + 1)}-${pad(tempDue.getDate())}`;
      }

      await adminClient
        .from('allocation_payment_schedules')
        .insert({
          allocation_id: newAlloc.id,
          job_id: reqData.job_id,
          freelancer_id: payload.freelancerId,
          nucleo_id: job.nucleo_id,
          installment_number: 1,
          payment_number: 1,
          total_payments: 1,
          reference_period_start: start_date,
          reference_period_end: end_date,
          due_date: due_date,
          amount: totalContractValue,
          remuneration_model: modelDb,
          status: 'pending'
        });
    }

    // Update job request
    await adminClient
      .from('job_freelancer_requests')
      .update({
        allocation_id: newAlloc.id,
        selected_freelancer_id: payload.freelancerId,
        locked_for_allocation: true,
        status: 'bookado',
        closed_at: new Date().toISOString(),
        closed_by: requester.id,
        closure_reason: 'Alocação homologada pelo núcleo'
      })
      .eq('id', payload.requestId);

    // Update parent job status to 'bookado'
    await adminClient
      .from('jobs')
      .update({ status: 'bookado' })
      .eq('id', reqData.job_id);

    // Update shortlist candidates
    await adminClient
      .from('shortlist_candidates')
      .update({
        selected_for_allocation: true,
        candidate_status: 'aprovado_rh',
        negotiation_status: 'aceitou'
      })
      .eq('id', candidate.id);

    // Deselect other candidates
    await adminClient
      .from('shortlist_candidates')
      .update({
        candidate_status: 'indisponivel',
        negotiation_status: 'nao_aceitou'
      })
      .eq('request_id', payload.requestId)
      .neq('id', candidate.id);

    // Record negotiation history
    await adminClient
      .from('negotiation_history')
      .insert({
        job_id: reqData.job_id,
        request_id: payload.requestId,
        shortlist_candidate_id: candidate.id,
        freelancer_id: payload.freelancerId,
        previous_status: 'em_negociacao',
        new_status: 'aceitou',
        previous_rate: payload.negotiatedRate,
        new_rate: payload.negotiatedRate,
        notes: payload.scope || 'Alocação confirmada no modelo ' + payload.paymentModel,
        changed_by: requester.id,
        changed_by_role: requesterProfile.role
      });

    return {
      success: true,
      allocation_id: newAlloc.id,
      allocation_code: newAlloc.allocation_code
    };
  } catch (err: any) {
    console.error('confirmAllocationAction error:', err);
    return { success: false, error: err.message || 'Erro inesperado no servidor.' };
  }
}

/**
 * Generates a payment request (faturamento) for a scheduled installment.
 */
export async function generatePaymentRequestAction(
  accessToken: string,
  scheduleId: string,
  payload: {
    paymentDueDate?: string;
    paymentDescription?: string;
    paymentJustification?: string;
  }
) {
  try {
    const adminClient = getSupabaseAdmin();

    // 1. Verify requester session
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) {
      return { success: false, error: 'Não autorizado. Sessão inválida.' };
    }

    const { data: requesterProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status, nucleo_id')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile || requesterProfile.status !== 'active') {
      return { success: false, error: 'Perfil do solicitante inativo ou inexistente.' };
    }

    if (requesterProfile.role === 'rh') {
      return { success: false, error: 'Usuários do RH não podem gerar solicitações de pagamento.' };
    }

    // 2. Fetch schedule
    const { data: schedule, error: schedErr } = await adminClient
      .from('allocation_payment_schedules')
      .select('*')
      .eq('id', scheduleId)
      .single();

    if (schedErr || !schedule) {
      return { success: false, error: 'Parcela de faturamento não encontrada.' };
    }

    if (schedule.status !== 'pending') {
      return { success: false, error: 'Esta parcela já possui faturamento emitido ou cancelado.' };
    }

    // Check permissions: NÚCLEO user can only generate requests for their own nucleo
    if (requesterProfile.role === 'nucleo' && requesterProfile.nucleo_id !== schedule.nucleo_id) {
      return { success: false, error: 'Você não tem permissão para emitir solicitação de pagamento desta alocação.' };
    }

    // 3. Generate Request Code: REQ-PAG-[NUCLEO_CODE]-[YYYY]-[INCREMENT]
    const { data: nucleo } = await adminClient
      .from('nucleos')
      .select('name, code')
      .eq('id', schedule.nucleo_id)
      .single();

    const nucPrefix = nucleo?.code || nucleo?.name?.substring(0, 3).toUpperCase() || 'NUC';
    const year = new Date().getFullYear();

    const { count } = await adminClient
      .from('payment_requests')
      .select('*', { count: 'exact', head: true });

    const increment = String((count || 0) + 1).padStart(4, '0');
    const requestCode = `REQ-PAG-${nucPrefix}-${year}-${increment}`;

    // Get total installments
    const { count: totalPayments } = await adminClient
      .from('allocation_payment_schedules')
      .select('*', { count: 'exact', head: true })
      .eq('allocation_id', schedule.allocation_id);

    // 4. Create request
    const { data: request, error: insertErr } = await adminClient
      .from('payment_requests')
      .insert({
        request_code: requestCode,
        allocation_id: schedule.allocation_id,
        payment_schedule_id: schedule.id,
        job_id: schedule.job_id,
        freelancer_id: schedule.freelancer_id,
        nucleo_id: schedule.nucleo_id,
        issued_by: requester.id,
        issued_by_role: requesterProfile.role,
        request_type: totalPayments && totalPayments > 1 ? 'recurring_installment' : 'one_time',
        payment_number: schedule.installment_number,
        total_payments: totalPayments || 1,
        reference_period_start: schedule.reference_period_start,
        reference_period_end: schedule.reference_period_end,
        amount: schedule.amount,
        payment_due_date: payload.paymentDueDate || schedule.due_date || null,
        payment_description: payload.paymentDescription || `Faturamento Ref Parcela ${schedule.installment_number}`,
        payment_justification: payload.paymentJustification || '',
        document_status: 'generated'
      })
      .select('*')
      .single();

    if (insertErr || !request) {
      console.error('Error inserting payment request:', insertErr);
      return { success: false, error: `Erro ao criar solicitação de pagamento: ${insertErr?.message}` };
    }

    // 5. Update schedule status
    await adminClient
      .from('allocation_payment_schedules')
      .update({
        status: 'payment_request_generated',
        payment_request_id: request.id
      })
      .eq('id', schedule.id);

    // Update allocation faturamento aggregation status
    await updateAllocationPaymentStatus(adminClient, schedule.allocation_id);

    return { success: true, data: request };
  } catch (err: any) {
    console.error('generatePaymentRequestAction error:', err);
    return { success: false, error: err.message || 'Erro interno no servidor.' };
  }
}

/**
 * Exports a payment request, marking it as exported and unlocking evaluation.
 */
export async function exportPaymentRequestAction(accessToken: string, requestId: string) {
  try {
    const adminClient = getSupabaseAdmin();
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) {
      return { success: false, error: 'Não autorizado. Sessão inválida.' };
    }

    const { data: requesterProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status, nucleo_id')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile || requesterProfile.status !== 'active') {
      return { success: false, error: 'Perfil do solicitante inativo ou inexistente.' };
    }

    if (requesterProfile.role === 'rh') {
      return { success: false, error: 'Usuários do RH não podem exportar faturamentos.' };
    }

    // Fetch request
    const { data: request, error: reqErr } = await adminClient
      .from('payment_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) {
      return { success: false, error: 'Solicitação de pagamento não encontrada.' };
    }

    // Fetch freelancer details for CNPJ validation
    const { data: freelancer, error: freelaErr } = await adminClient
      .from('freelancers')
      .select('cnpj_normalized, cnpj_is_mock, tax_country_code')
      .eq('id', request.freelancer_id)
      .single();

    if (freelaErr || !freelancer) {
      return { success: false, error: 'Freelancer associado à solicitação de pagamento não encontrado.' };
    }

    if (freelancer.tax_country_code === 'BR') {
      if (!freelancer.cnpj_normalized || freelancer.cnpj_normalized.trim() === '') {
        return { success: false, error: 'Não é possível emitir a Solicitação de Pagamento porque o freelancer não possui CNPJ cadastrado.' };
      }
      if (freelancer.cnpj_is_mock) {
        return { success: false, error: 'O freelancer possui CNPJ de teste. Confirme o CNPJ real antes de emitir a Solicitação de Pagamento.' };
      }
    }

    // Check permissions: NÚCLEO user can only export requests belonging to their own nucleo
    if (requesterProfile.role === 'nucleo' && requesterProfile.nucleo_id !== request.nucleo_id) {
      return { success: false, error: 'Você não tem permissão para emitir solicitação de pagamento desta alocação.' };
    }

    // Update request
    const { error: updateErr } = await adminClient
      .from('payment_requests')
      .update({
        document_status: 'exported',
        exported_at: new Date().toISOString(),
        exported_by: requester.id
      })
      .eq('id', requestId);

    if (updateErr) {
      return { success: false, error: 'Erro ao atualizar faturamento para exportado.' };
    }

    // Update schedule to 'exported'
    if (request.payment_schedule_id) {
      await adminClient
        .from('allocation_payment_schedules')
        .update({ status: 'exported' })
        .eq('id', request.payment_schedule_id);
    }

    // CRITICAL: Unlock evaluation status on allocation
    const { data: allocation } = await adminClient
      .from('allocations')
      .select('evaluation_status')
      .eq('id', request.allocation_id)
      .single();

    if (allocation && allocation.evaluation_status === 'locked') {
      await adminClient
        .from('allocations')
        .update({ evaluation_status: 'available' })
        .eq('id', request.allocation_id);
    }

    // Update allocation payment aggregates
    await updateAllocationPaymentStatus(adminClient, request.allocation_id);

    return { success: true };
  } catch (err: any) {
    console.error('exportPaymentRequestAction error:', err);
    return { success: false, error: err.message || 'Erro interno no servidor.' };
  }
}

/**
 * Registers ERP finance code to a payment request.
 */
export async function registerFinanceCodeAction(accessToken: string, requestId: string, financeCode: string) {
  try {
    if (!financeCode || !financeCode.trim()) {
      return { success: false, error: 'Código financeiro não pode estar vazio.' };
    }

    const adminClient = getSupabaseAdmin();
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) {
      return { success: false, error: 'Não autorizado. Sessão inválida.' };
    }

    const { data: requesterProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status, nucleo_id')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile || requesterProfile.status !== 'active') {
      return { success: false, error: 'Perfil do solicitante inativo ou inexistente.' };
    }

    if (requesterProfile.role === 'rh') {
      return { success: false, error: 'Usuários do RH não podem registrar códigos de pagamento.' };
    }

    // Fetch request
    const { data: request, error: reqErr } = await adminClient
      .from('payment_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) {
      return { success: false, error: 'Solicitação de pagamento não encontrada.' };
    }

    // Check permissions: NÚCLEO user can only register codes for their own nucleo
    if (requesterProfile.role === 'nucleo' && requesterProfile.nucleo_id !== request.nucleo_id) {
      return { success: false, error: 'Você não tem permissão para registrar códigos de pagamento desta alocação.' };
    }

    // Update request
    const { error: updateErr } = await adminClient
      .from('payment_requests')
      .update({
        document_status: 'finance_code_registered',
        finance_code: financeCode.trim(),
        finance_code_registered_at: new Date().toISOString(),
        finance_code_registered_by: requester.id
      })
      .eq('id', requestId);

    if (updateErr) {
      return { success: false, error: 'Erro ao registrar código ERP financeiro.' };
    }

    // Update schedule
    if (request.payment_schedule_id) {
      await adminClient
        .from('allocation_payment_schedules')
        .update({
          status: 'finance_code_received',
          finance_code: financeCode.trim()
        })
        .eq('id', request.payment_schedule_id);
    }

    return { success: true };
  } catch (err: any) {
    console.error('registerFinanceCodeAction error:', err);
    return { success: false, error: err.message || 'Erro interno no servidor.' };
  }
}

/**
 * Action to operate and mark an allocation/job as completed.
 */
export async function concludeAllocationAction(
  accessToken: string,
  allocationId: string,
  completionNotes: string
) {
  try {
    const adminClient = getSupabaseAdmin();

    // 1. Verify requester session
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) {
      return { success: false, error: 'Não autorizado. Sessão inválida.' };
    }

    // Check requester profile permissions
    const { data: requesterProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status, nucleo_id')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile || requesterProfile.status !== 'active') {
      return { success: false, error: 'Perfil do solicitante inativo ou inexistente.' };
    }

    // Fetch allocation
    const { data: allocation, error: allocErr } = await adminClient
      .from('allocations')
      .select('id, nucleo_id, job_id, status')
      .eq('id', allocationId)
      .single();

    if (allocErr || !allocation) {
      return { success: false, error: 'Alocação não encontrada.' };
    }

    // Check if requester belongs to same nucleo (unless master or c_level)
    if (requesterProfile.role === 'nucleo' && requesterProfile.nucleo_id !== allocation.nucleo_id) {
      return { success: false, error: 'Você não tem permissão para gerenciar alocações de outro núcleo.' };
    }

    if (requesterProfile.role === 'rh') {
      return { success: false, error: 'RH não pode concluir alocações diretamente.' };
    }

    // Update allocation status to completed
    const { error: updateAllocErr } = await adminClient
      .from('allocations')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by_user_id: requester.id,
        completion_notes: completionNotes || 'Conclusão operacional efetuada pelo núcleo.',
        evaluation_status: 'available' // Unlock evaluations
      })
      .eq('id', allocationId);

    if (updateAllocErr) {
      return { success: false, error: `Erro ao concluir alocação: ${updateAllocErr.message}` };
    }

    // Update parent job status to completed/concluido
    const { error: updateJobErr } = await adminClient
      .from('jobs')
      .update({ status: 'concluido' })
      .eq('id', allocation.job_id);

    if (updateJobErr) {
      console.error('Failed to update job status to concluido:', updateJobErr);
    }

    // Update job request status too
    const { error: updateRequestErr } = await adminClient
      .from('job_freelancer_requests')
      .update({ status: 'concluido' })
      .eq('allocation_id', allocationId);

    if (updateRequestErr) {
      console.error('Failed to update request status to concluido:', updateRequestErr);
    }

    return { success: true };
  } catch (err: any) {
    console.error('concludeAllocationAction error:', err);
    return { success: false, error: err.message || 'Erro inesperado no servidor.' };
  }
}

/**
 * Action to cancel an active allocation.
 */
export async function cancelAllocationAction(
  accessToken: string,
  allocationId: string
) {
  try {
    const adminClient = getSupabaseAdmin();
    // Verify requester
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) return { success: false, error: 'Sessão inválida.' };

    const { data: requesterProfile } = await adminClient.from('profiles').select('role, nucleo_id').eq('id', requester.id).single();
    if (!requesterProfile) return { success: false, error: 'Perfil não encontrado.' };

    const { data: allocation } = await adminClient.from('allocations').select('*').eq('id', allocationId).single();
    if (!allocation) return { success: false, error: 'Alocação não encontrada.' };

    if (requesterProfile.role === 'nucleo' && requesterProfile.nucleo_id !== allocation.nucleo_id) {
      return { success: false, error: 'Permissão negada.' };
    }

    if (requesterProfile.role === 'rh') {
      return { success: false, error: 'RH não pode cancelar alocações diretamente.' };
    }

    // Update statuses to cancelled
    await adminClient.from('allocations').update({ status: 'cancelled' }).eq('id', allocationId);
    await adminClient.from('jobs').update({ status: 'cancelado' }).eq('id', allocation.job_id);
    await adminClient.from('job_freelancer_requests').update({ status: 'cancelado' }).eq('allocation_id', allocationId);

    return { success: true };
  } catch (err: any) {
    console.error('cancelAllocationAction error:', err);
    return { success: false, error: err.message || 'Erro interno.' };
  }
}

/**
 * Action to reopen a completed/cancelled allocation.
 */
export async function reopenAllocationAction(
  accessToken: string,
  allocationId: string
) {
  try {
    const adminClient = getSupabaseAdmin();
    const { data: { user: requester }, error: authErr } = await adminClient.auth.getUser(accessToken);
    if (authErr || !requester) return { success: false, error: 'Sessão inválida.' };

    const { data: requesterProfile } = await adminClient.from('profiles').select('role, nucleo_id').eq('id', requester.id).single();
    if (!requesterProfile) return { success: false, error: 'Perfil não encontrado.' };

    const { data: allocation } = await adminClient.from('allocations').select('*').eq('id', allocationId).single();
    if (!allocation) return { success: false, error: 'Alocação não encontrada.' };

    if (requesterProfile.role === 'nucleo' && requesterProfile.nucleo_id !== allocation.nucleo_id) {
      return { success: false, error: 'Permissão negada.' };
    }

    if (requesterProfile.role === 'rh') {
      return { success: false, error: 'RH não pode reabrir alocações diretamente.' };
    }

    // Reopen to booked
    await adminClient.from('allocations').update({ 
      status: 'booked', 
      completed_at: null, 
      completed_by_user_id: null, 
      completion_notes: null 
    }).eq('id', allocationId);
    
    await adminClient.from('jobs').update({ status: 'bookado' }).eq('id', allocation.job_id);
    await adminClient.from('job_freelancer_requests').update({ status: 'bookado' }).eq('allocation_id', allocationId);

    return { success: true };
  } catch (err: any) {
    console.error('reopenAllocationAction error:', err);
    return { success: false, error: err.message || 'Erro interno.' };
  }
}



