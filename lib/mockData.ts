export type ProfileType = 'MASTER' | 'RH' | 'NÚCLEO' | 'C-LEVEL' | 'OPERAÇÃO' | 'OPERAÇÕES';

export interface User {
  id: string;
  name: string;
  email: string;
  profile: ProfileType;
  nucleoId?: string;
  status: 'Ativo' | 'Inativo';
  role?: string;
  password?: string;
  firstAccessPending?: boolean;
  lastLogin?: string;
  isSeedMaster?: boolean;
  themePreference?: 'dark' | 'light' | 'system';
  /** Indica se este usuário é Head (responsável) do seu núcleo */
  isNucleusHead?: boolean;
  isMasterAccount?: boolean;
  isSimulated?: boolean;
}

export interface Nucleo {
  id: string;
  name: string;
  headName: string;
  headEmail: string;
  status: 'Ativo' | 'Inativo';
  jobCount?: number;
  freelaUsedCount?: number;
  headUserId?: string;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
}

export interface Freelancer {
  id: string;
  name: string;
  fullName?: string;
  email: string;
  whatsapp: string;
  city: string;
  state: string;
  mainRole: string;
  secondaryRoles: string[];
  seniority: 'Júnior' | 'Pleno' | 'Sênior' | 'Especialista';
  industries: string[];
  portfolioUrl: string;
  status: 'Elegível' | 'Em análise' | 'Em onboarding' | 'Em observação' | 'Bloqueado' | 'Inativo';
  availability: 'Imediata' | '15 dias' | '30+ dias' | 'Indisponível';
  referenceValue: number;
  averageScore: number;
  observations: string;
  experienceWithV3A: boolean;
  // Extended fields
  locationText?: string;
  plannerScore?: number;
  powerpointScore?: number;
  hasWorkedWithV3a?: string;
  v3aProjects?: string;
  currentSituation?: string;
  contractType?: string;
  brandsWorked?: string;
  // Social & portfolio
  linkedinUrl?: string;
  instagramUrl?: string;
  portfolioFileUrl?: string;
  portfolioFilePath?: string;
  portfolioFileName?: string;
  mergedIntoFreelancerId?: string | null;
  consolidatedScore?: number;
  recommendationRate?: number;
  operationalStatus?: string;
  cnpj_normalized?: string;
  cnpj_is_mock?: boolean;
  cnpj_mock_batch?: string;
  foreign_tax_id?: string;
  tax_country_code?: string;
  cnpj_source?: string;
}

export type JobStatus = string;

export interface Job {
  id: string;
  job_code?: string;
  jobCode?: string;
  createdAt?: string;
  jobId?: string;
  name: string;
  title?: string;
  client: string;
  clientName?: string;
  nucleoId: string;
  requesterId: string;
  roleNeeded: string;
  seniorityNeeded: 'Júnior' | 'Pleno' | 'Sênior' | 'Especialista';
  description: string;
  deliverables: string;
  startDate: string;
  endDate: string;
  budget: number;
  urgency: 'Alta' | 'Média' | 'Baixa';
  status: JobStatus;
  selectedFreelancerId?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  closureReason?: string | null;
  paymentFlow?: 'one_time' | 'recurring';
  remunerationModel?: 'daily' | 'hourly' | 'fixed_job' | 'monthly_salary';
  paymentDatesGenerated?: string[];
  paymentDatesSelected?: string[];
  paymentDatesExcluded?: string[];
  expectedRate?: number;
  expectedHours?: number;
  expectedPaymentDay?: number;
  expectedPaymentCount?: number;
  expectedTotalCompensation?: number;
  expectedBudgetSavingAmount?: number;
  expectedBudgetSavingPercentage?: number;
  paymentPolicyStatus?: 'within_policy' | 'above_policy_requires_approval' | 'no_policy_found';
  /** Status de aderência à política de valores (calculado na criação/negociação) */
  policyStatus?: 'inside_policy' | 'outside_policy' | 'policy_missing';
  /** Indica se o job já ultrapassava a política na criação da oportunidade */
  policyExceededAtCreation?: boolean;
  /** Teto de política estimado para este job (calculado) */
  policyLimitAmount?: number;
  /** Referência de política estimada para este job (calculado) */
  policyReferenceAmount?: number;
  /** Indica se requer aprovação do Head antes de homologar */
  approvalRequired?: boolean;
  is_competitive_bid?: boolean;
  success_fee_enabled?: boolean;
  successFeeEnabled?: boolean;
}

export interface ProposalInvitation {
  id: string;
  jobId: string;
  jobCode: string;
  freelancerId: string;
  shortlistCandidateId?: string;
  negotiationId?: string;
  publicLinkId?: string;
  status: 'created' | 'sent' | 'delivered' | 'opened' | 'waiting_response' | 'accepted' | 'accepted_with_reservations' | 'refused' | 'expired' | 'cancelled' | 'reopened';
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  respondedAt?: string;
  responseType?: 'accepted' | 'accepted_with_reservations' | 'refused';
  refusalReason?: string;
  freelancerNotes?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmailEvent {
  id: string;
  eventType: 'proposal_dispatch' | 'proposal_response_notification' | 'reminder' | 'evaluation_alert' | 'system_notification';
  recipientEmail: string;
  recipientName?: string;
  templateKey: string;
  relatedJobId?: string;
  relatedJobCode?: string;
  relatedFreelancerId?: string;
  relatedPublicLinkId?: string;
  relatedProposalInvitationId?: string;
  status: 'pending' | 'sent' | 'failed' | 'error' | 'cancelled';
  providerMessageId?: string;
  errorMessage?: string;
  sentAt?: string;
  createdAt?: string;
  metadata?: any;
}

export interface JobSuccessFeeRule {
  id: string;
  jobId: string;
  feeType: 'fixed' | 'percentage';
  fixedAmount?: number;
  percentageRate?: number;
  percentageBase?: string;
  triggerType?: string;
  terms?: string;
  requiresApproval?: boolean;
  createdBy?: string;
  version?: number;
  isActive?: boolean;
}

export interface NegotiationSuccessFee {
  id: string;
  negotiationId: string;
  enabled: boolean;
  feeType: 'fixed' | 'percentage';
  fixedAmount?: number;
  percentageRate?: number;
  percentageBase?: string;
  calculatedPotentialAmount?: number;
  triggerType?: string;
  terms?: string;
  acceptedByFreelancer?: boolean;
  acceptedAt?: string;
  approvalRequestId?: string;
}

export interface AllocationSuccessFee {
  id: string;
  allocationId: string;
  jobId: string;
  freelancerId: string;
  feeType: 'fixed' | 'percentage';
  fixedAmount?: number;
  percentageRate?: number;
  percentageBase?: string;
  potentialAmount?: number;
  triggerType?: string;
  termsSnapshot?: string;
  status: 'not_applicable' | 'pending_competition_result' | 'eligible' | 'not_eligible' | 'cancelled';
  eligibleAt?: string;
  eligibilityConfirmedBy?: string;
  ineligibilityReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface JobCompetitionResult {
  id: string;
  jobId: string;
  result: 'pending' | 'won' | 'lost' | 'cancelled';
  confirmedBy?: string;
  confirmedAt?: string;
  evidenceReference?: string;
  notes?: string;
}

export interface AllocationPaymentProjection {
  id: string;
  allocationId: string;
  cycleNumber: number;
  cycleStartDate: string;
  cycleEndDate: string;
  suggestedPaymentDate: string;
  suggestedRcDeadline: string;
  alertLevel: 'informational' | 'attention' | 'urgent' | 'critical';
  policyRuleId?: string;
  policyVersion?: string;
  calculationMemory?: any;
  status: 'active' | 'recalculated' | 'superseded' | 'cancelled';
  replacedById?: string;
  calculatedAt?: string;
  calculationSource?: 'system' | 'recalculation' | 'legacy';
  triggeredByUserId?: string;
}

export interface EvaluationAnswer {
  id: string;
  evaluationId: string;
  criterionKey: string;
  score: number;
  weight: number;
  comment?: string;
  createdAt?: string;
}

export interface EvaluationReminder {
  id: string;
  allocationId: string;
  evaluationType: string;
  firstDueAt: string;
  nextNotificationAt: string;
  notificationCount: number;
  status: 'pending' | 'resolved' | 'waived' | 'cancelled';
  resolvedAt?: string;
  waiverReason?: string;
}


export interface Shortlist {
  id: string;
  jobId: string;
  freelancerId: string;
  candidateStatus: string;
  notes?: string;
  negotiationStatus?: string;
  negotiatedRate?: number;
  remunerationModel?: string;
  policyStatus?: string;
  scheduleConflict?: boolean;
  scheduleConflictApproved?: boolean;
  requiresRhApproval?: boolean;
  requiresHeadApproval?: boolean;
  selectedForAllocation?: boolean;
  sourceBucket?: string;
  matchScore?: number;
  recommendationReasons?: string[];
  shortlistPosition?: number;
  // Financial calculation fields
  negotiatedTotal?: number;
  budgetSavingAmount?: number;
  budgetSavingPercentage?: number;
  dailyBudgetReference?: number;
  dailySavingAmount?: number;
  budgetDeltaStatus?: string;
  estimatedHours?: number;
  scheduleApprovalId?: string | null;
  valueApprovalId?: string | null;
  // Persistent negotiation fields
  paymentModel?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  preferredDueDay?: number;
  paymentTerms?: string;
  paymentNotes?: string;
  paymentDatesExcluded?: string[];
}

export interface Negotiation {
  id: string;
  jobId: string;
  freelancerId: string;
  negotiatedValue: number;
  billingType: 'Diária' | 'Hora' | 'Job Fechado' | 'Mensal / Salário';
  scope: string;
  status: string;
  justificationIfAbovePolicy?: string;
}

export interface ValuePolicy {
  id: string;
  role: string;
  seniority: 'Júnior' | 'Pleno' | 'Sênior' | 'Especialista';
  billingType: 'Diária' | 'Hora' | 'Job Fechado' | 'Mensal / Salário';
  referenceValue: number;
  ceilingValue: number;
  status?: 'Ativo' | 'Inativo';
  remunerationModel?: string;
  updatedAt?: string;
  approvalRequiredAbove?: number;
  notes?: string;
  successFeeMaxPercent?: number;
}

export interface Allocation {
  id: string;
  allocationCode: string;
  jobId: string;
  job_code?: string;
  jobCode?: string;
  freelancerId: string;
  nucleoId: string;
  startDate: string;
  endDate: string;
  approvedValue: number;
  status: string;
  createdAt?: string;
  // Financial calculation fields
  negotiatedTotal?: number;
  budgetSavingAmount?: number;
  budgetSavingPercentage?: number;
  dailyBudgetReference?: number;
  dailySavingAmount?: number;
  budgetDeltaStatus?: string;
  estimatedHours?: number;
  remunerationModel?: string;
  // Recurrent and billing model fields
  paymentModel?: 'one_time' | 'monthly_recurring' | 'milestone';
  contractStartDate?: string;
  contractEndDate?: string;
  recurrenceFrequency?: 'none' | 'monthly' | 'custom';
  recurringAmount?: number;
  totalContractValue?: number;
  paymentTerms?: string;
  paymentNotes?: string;
  paymentRequestStatus?: 'not_requested' | 'partially_requested' | 'requested' | 'completed' | 'cancelled';
  success_fee_enabled?: boolean;
  successFeeEnabled?: boolean;
  successFeeAmount?: number;
  evaluationStatus?: 'locked' | 'available' | 'pending' | 'completed';
  reverseEvaluationStatus?: 'not_generated' | 'generated' | 'sent' | 'completed' | 'expired';
  evaluatedFreelancer?: boolean;
  evaluatedDelivery?: boolean;
}

export interface AllocationPaymentSchedule {
  id: string;
  allocationId: string;
  jobId: string;
  freelancerId: string;
  nucleoId: string;
  installmentNumber: number;
  referencePeriodStart: string;
  referencePeriodEnd: string;
  dueDate?: string;
  amount: number;
  status: 'pending' | 'payment_request_generated' | 'exported' | 'sent_to_finance' | 'finance_code_received' | 'paid' | 'cancelled';
  paymentRequestId?: string;
  financeCode?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentRequest {
  id: string;
  requestCode: string;
  allocationId: string;
  paymentScheduleId?: string;
  jobId: string;
  freelancerId: string;
  nucleoId: string;
  issuedBy: string;
  issuedByRole: string;
  requestType: 'one_time' | 'recurring_installment' | 'milestone';
  paymentNumber?: number;
  totalPayments?: number;
  referencePeriodStart?: string;
  referencePeriodEnd?: string;
  amount: number;
  paymentDueDate?: string;
  paymentDescription?: string;
  paymentJustification?: string;
  documentStatus: 'generated' | 'exported' | 'sent_to_finance' | 'finance_code_registered' | 'paid' | 'cancelled';
  exportedAt?: string;
  exportedBy?: string;
  documentUrl?: string;
  documentFileName?: string;
  financeCode?: string;
  financeCodeRegisteredAt?: string;
  financeCodeRegisteredBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReverseEvaluationLink {
  id: string;
  token: string;
  allocationId: string;
  jobId: string;
  freelancerId: string;
  nucleoId: string;
  status: 'active' | 'used' | 'expired' | 'cancelled';
  expiresAt?: string;
  usedAt?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Evaluation {
  id: string;
  jobId: string;
  freelancerId: string;
  evaluatorId: string;
  technicalQuality: number;
  deadline: number;
  briefingAdherence: number;
  communication: number;
  autonomy: number;
  behavior: number;
  collaboration?: number;
  flexibility?: number;
  costBenefit?: number;
  finalScore: number;
  score0to100?: number;
  comment: string;
  recommendation: 'Sim' | 'Sim, com restrição' | 'Não';
  wouldHireAgain?: string;
  reworkLevel?: string;
  criticalProblem?: boolean;
  conditionalAnswers?: any;
  // New behavioral and quality criteria
  reliability?: number;
  cultureProcesses?: number;
  rework?: number;
  scopeAdherence?: number;
  materialsQuality?: number;
}

export interface PaymentCode {
  id: string;
  allocationCode: string;
  jobId: string;
  freelancerId: string;
  approvedValue: number;
  paymentStatus: 'Aguardando conclusão do job' | 'Aguardando avaliação' | 'Liberado para pagamento' | 'Bloqueado' | 'Encerrado';
}

export interface ValueExceptionApproval {
  id: string;
  jobId: string;
  requestId?: string;
  shortlistCandidateId?: string;
  freelancerId?: string;
  nucleusId?: string;
  approvalType: 'value_exception' | 'schedule_conflict';
  status: 'pending' | 'approved' | 'rejected';
  requestedBy?: string;
  requestedTo?: string;
  approverId?: string;
  approverRole?: string;
  reason?: string;
  decisionNotes?: string;
  policyReferenceValue?: number;
  policyCeilingValue?: number;
  negotiatedValue?: number;
  requestedAmount?: number;
  remunerationModel?: string;
  calculatedPolicyReference?: number;
  calculatedPolicyLimit?: number;
  excessAmount?: number;
  excessPercent?: number;
  approvedBy?: string;
  approvedAt?: string;
  approvalComment?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionComment?: string;
  createdAt?: string;
  decidedAt?: string;
}

export interface Suggestion {
  id: string;
  freelancerName: string;
  email: string;
  whatsapp: string;
  suggestedRole: string;
  portfolioUrl: string;
  reason: string;
  relatedProject: string;
  observations?: string;
  nucleoId: string;
  suggestedBy: string;
  status: 'Pendente de análise RH' | 'Aprovada' | 'Rejeitada' | 'Duplicada';
}

// Initial structured data conforming to rules
export const initialUsers: User[] = [
  { id: 'usr-1', name: 'Diretor Master (Demo)', email: 'master.demo@v3a.com', profile: 'MASTER', status: 'Ativo', password: 'DemoUser123!', firstAccessPending: false, role: 'Diretor Master' },
  { id: 'usr-2', name: 'Gerente de RH (Demo)', email: 'rh.demo@v3a.com', profile: 'RH', status: 'Ativo', password: 'DemoUser123!', firstAccessPending: true, role: 'Gerente Operacional de RH' },
  { id: 'usr-3', name: 'Head de Marketing (Demo)', email: 'marketing.demo@v3a.com', profile: 'NÚCLEO', nucleoId: 'nuc-2', status: 'Ativo', password: 'DemoUser123!', firstAccessPending: true, role: 'Head de Marketing' },
  { id: 'usr-4', name: 'Head de Design (Demo)', email: 'design.demo@v3a.com', profile: 'NÚCLEO', nucleoId: 'nuc-3', status: 'Ativo', password: 'DemoUser123!', firstAccessPending: true, role: 'Head de Design & Criação' },
  { id: 'usr-5', name: 'Diretor Executivo (Demo)', email: 'diretoria.demo@v3a.com', profile: 'MASTER', status: 'Ativo', password: 'DemoUser123!', firstAccessPending: false, role: 'Diretor Geral Executivo' },
  { id: 'usr-6', name: 'Gerente Geral de RH (Demo)', email: 'rh.geral.demo@v3a.com', profile: 'RH', status: 'Ativo', password: 'DemoUser123!', firstAccessPending: false, role: 'Gerente Geral do RH' },
  { id: 'usr-7', name: 'Analista de Onboarding (Demo)', email: 'onboarding.demo@v3a.com', profile: 'RH', status: 'Ativo', password: 'DemoUser123!', firstAccessPending: false, role: 'Analista de Onboarding' },
  { id: 'usr-8', name: 'Head de Tecnologia (Demo)', email: 'tech.demo@v3a.com', profile: 'NÚCLEO', nucleoId: 'nuc-1', status: 'Ativo', password: 'DemoUser123!', firstAccessPending: false, role: 'Líder de Tecnologia' }
];

export const initialNucleos: Nucleo[] = [
  { id: 'nuc-1', name: 'Tecnologia', headName: 'Head de Tecnologia (Demo)', headEmail: 'tech.demo@v3a.com', status: 'Ativo', jobCount: 4, freelaUsedCount: 3 },
  { id: 'nuc-2', name: 'Marketing', headName: 'Head de Marketing (Demo)', headEmail: 'marketing.demo@v3a.com', status: 'Ativo', jobCount: 3, freelaUsedCount: 4 },
  { id: 'nuc-3', name: 'Design & Criação', headName: 'Head de Design (Demo)', headEmail: 'design.demo@v3a.com', status: 'Ativo', jobCount: 5, freelaUsedCount: 5 },
  { id: 'nuc-4', name: 'Planejamento & Estratégia', headName: 'Head de Planejamento (Demo)', headEmail: 'planejamento.demo@v3a.com', status: 'Ativo', jobCount: 2, freelaUsedCount: 2 },
  { id: 'nuc-5', name: 'Produção Executiva', headName: 'Head de Produção (Demo)', headEmail: 'producao.demo@v3a.com', status: 'Ativo', jobCount: 3, freelaUsedCount: 3 },
  { id: 'nuc-6', name: 'Operações de Campo', headName: 'Head de Operações (Demo)', headEmail: 'operacoes.demo@v3a.com', status: 'Ativo', jobCount: 1, freelaUsedCount: 1 },
];

export const initialValuePolicies: ValuePolicy[] = [
  { id: 'pol-1', role: 'Diretor de Arte', seniority: 'Sênior', billingType: 'Diária', referenceValue: 600, ceilingValue: 800 },
  { id: 'pol-2', role: 'Designer 3D', seniority: 'Sênior', billingType: 'Diária', referenceValue: 700, ceilingValue: 900 },
  { id: 'pol-3', role: 'Planejamento', seniority: 'Pleno', billingType: 'Diária', referenceValue: 500, ceilingValue: 650 },
  { id: 'pol-4', role: 'Produtor Executivo', seniority: 'Sênior', billingType: 'Diária', referenceValue: 800, ceilingValue: 1000 },
  { id: 'pol-5', role: 'Produtor de Campo', seniority: 'Pleno', billingType: 'Diária', referenceValue: 400, ceilingValue: 550 },
  { id: 'pol-6', role: 'Atendimento', seniority: 'Pleno', billingType: 'Diária', referenceValue: 450, ceilingValue: 600 },
  { id: 'pol-7', role: 'Redator', seniority: 'Pleno', billingType: 'Diária', referenceValue: 400, ceilingValue: 550 },
  { id: 'pol-8', role: 'Motion Designer', seniority: 'Sênior', billingType: 'Diária', referenceValue: 650, ceilingValue: 850 },
  { id: 'pol-9', role: 'Cenógrafo', seniority: 'Especialista', billingType: 'Diária', referenceValue: 900, ceilingValue: 1200 },
  { id: 'pol-10', role: 'Conteúdo', seniority: 'Pleno', billingType: 'Diária', referenceValue: 400, ceilingValue: 500 },
];

export const initialFreelancers: Freelancer[] = [
  {
    id: 'free-1',
    name: 'Carlos Silva',
    email: 'carlos.designer@gmail.com',
    whatsapp: '(11) 98765-4321',
    city: 'São Paulo',
    state: 'SP',
    mainRole: 'Designer 3D',
    secondaryRoles: ['Diretor de Arte'],
    seniority: 'Sênior',
    industries: ['Bebidas', 'Tecnologia'],
    portfolioUrl: 'behance.net/carlossilvadesign',
    status: 'Elegível',
    availability: 'Imediata',
    referenceValue: 750,
    averageScore: 4.85,
    observations: 'Perfil extremamente criativo, focado em cenografia virtual e realidade aumentada.',
    experienceWithV3A: true,
  },
  {
    id: 'free-2',
    name: 'Amanda Costa',
    email: 'amanda.mkt@hotmail.com',
    whatsapp: '(21) 99123-4567',
    city: 'Rio de Janeiro',
    state: 'RJ',
    mainRole: 'Planejamento',
    secondaryRoles: ['Conteúdo'],
    seniority: 'Pleno',
    industries: ['Varejo', 'Beleza'],
    portfolioUrl: 'linkedin.com/in/amandacostaplan',
    status: 'Elegível',
    availability: '15 dias',
    referenceValue: 520,
    averageScore: 4.90,
    observations: 'Excelente comunicação, domina metodologias ágeis de gestão de eventos.',
    experienceWithV3A: true,
  },
  {
    id: 'free-3',
    name: 'João Pedro Santos',
    email: 'jp.arte@v3a.com',
    whatsapp: '(11) 98111-2222',
    city: 'Campinas',
    state: 'SP',
    mainRole: 'Diretor de Arte',
    secondaryRoles: ['Motion Designer'],
    seniority: 'Sênior',
    industries: ['Automotivo', 'Entretenimento'],
    portfolioUrl: 'carbonmade.com/jparter',
    status: 'Elegível',
    availability: 'Imediata',
    referenceValue: 650,
    averageScore: 4.72,
    observations: 'Alta produtividade técnica de assets sob pressão.',
    experienceWithV3A: false,
  },
  {
    id: 'free-4',
    name: 'Mariana Costa',
    email: 'mari.conteudo@v3a.com',
    whatsapp: '(31) 98555-6666',
    city: 'Belo Horizonte',
    state: 'MG',
    mainRole: 'Conteúdo',
    secondaryRoles: ['Redator'],
    seniority: 'Júnior',
    industries: ['Alimentação', 'Saúde'],
    portfolioUrl: 'medium.com/mariconteudos',
    status: 'Em análise',
    availability: 'Imediata',
    referenceValue: 350,
    averageScore: 0,
    observations: 'Indicada no núcleo de marketing. Portfolio promissor de copywriting.',
    experienceWithV3A: false,
  },
  {
    id: 'free-5',
    name: 'Lucas Martins',
    email: 'lucas.produtor@gmail.com',
    whatsapp: '(21) 99666-5544',
    city: 'Niterói',
    state: 'RJ',
    mainRole: 'Produtor Executivo',
    secondaryRoles: ['Produtor de Campo'],
    seniority: 'Sênior',
    industries: ['Entretenimento', 'Financeiro'],
    portfolioUrl: 'linkedin.com/in/lucasprodexec',
    status: 'Elegível',
    availability: '30+ dias',
    referenceValue: 850,
    averageScore: 4.98,
    observations: 'Larga experiência em festivais de música de grande porte. Extremamente rigoroso com planilhas.',
    experienceWithV3A: true,
  },
  {
    id: 'free-6',
    name: 'Ana Paula Rosa',
    email: 'anapaula.atendimento@outlook.com',
    whatsapp: '(41) 98888-7777',
    city: 'Curitiba',
    state: 'PR',
    mainRole: 'Atendimento',
    secondaryRoles: ['Planejamento'],
    seniority: 'Sênior',
    industries: ['Beleza', 'Tecnologia'],
    portfolioUrl: 'linkedin.com/in/anapaularosa',
    status: 'Bloqueado',
    availability: 'Indisponível',
    referenceValue: 620,
    averageScore: 2.10,
    observations: 'Bloqueado por problemas contratuais graves com o cliente de Varejo S.A.',
    experienceWithV3A: true,
  },
  {
    id: 'free-7',
    name: 'Roberto Alves',
    email: 'roberto.alves.campo@gmail.com',
    whatsapp: '(11) 97777-8888',
    city: 'São Paulo',
    state: 'SP',
    mainRole: 'Produtor de Campo',
    secondaryRoles: ['Produtor Executivo'],
    seniority: 'Pleno',
    industries: ['Agro', 'Bebidas'],
    portfolioUrl: 'linkedin.com/in/robertocampo',
    status: 'Elegível',
    availability: 'Imediata',
    referenceValue: 450,
    averageScore: 4.65,
    observations: 'Muito proativo em campo. Excelente relacionamento com fornecedores locais de estrutura.',
    experienceWithV3A: true,
  },
  {
    id: 'free-8',
    name: 'Fernanda Lima',
    email: 'fernandalima.redacao@gmail.com',
    whatsapp: '(51) 98122-3344',
    city: 'Porto Alegre',
    state: 'RS',
    mainRole: 'Redator',
    secondaryRoles: ['Conteúdo'],
    seniority: 'Pleno',
    industries: ['Varejo', 'Financeiro'],
    portfolioUrl: 'clippings.me/fernandaredatora',
    status: 'Elegível',
    availability: 'Imediata',
    referenceValue: 480,
    averageScore: 4.80,
    observations: 'Especialista em tom de voz institucional e roteiros para ativações físicas de Live Mkt.',
    experienceWithV3A: true,
  },
  {
    id: 'free-9',
    name: 'Eduardo Santos',
    email: 'edu.motion@v3a.com',
    whatsapp: '(11) 99188-3322',
    city: 'Santos',
    state: 'SP',
    mainRole: 'Motion Designer',
    secondaryRoles: ['Designer 3D'],
    seniority: 'Sênior',
    industries: ['Entretenimento', 'Tecnologia'],
    portfolioUrl: 'vimeo.com/edumotions',
    status: 'Em onboarding',
    availability: 'Imediata',
    referenceValue: 680,
    averageScore: 0,
    observations: 'Passando por validação fiscal e assinatura de contrato guarda-chuva.',
    experienceWithV3A: false,
  },
  {
    id: 'free-10',
    name: 'Camila Alves',
    email: 'camila.cenografia@gmail.com',
    whatsapp: '(21) 98144-1122',
    city: 'Rio de Janeiro',
    state: 'RJ',
    mainRole: 'Cenógrafo',
    secondaryRoles: ['Diretor de Arte'],
    seniority: 'Especialista',
    industries: ['Entretenimento', 'Automotivo'],
    portfolioUrl: 'camilaalves.design',
    status: 'Elegível',
    availability: '15 dias',
    referenceValue: 1100,
    averageScore: 4.95,
    observations: 'Referência no mercado de cenografia de feiras corporativas e stands interativos.',
    experienceWithV3A: true,
  },
  { id: 'free-11', name: 'Guilherme Ferreira', email: 'guilherme.f@v3a.com', whatsapp: '(11) 92345-6789', city: 'São Paulo', state: 'SP', mainRole: 'Produtor de Campo', secondaryRoles: [], seniority: 'Pleno', industries: ['Bebidas'], portfolioUrl: 'link.com', status: 'Elegível', availability: 'Imediata', referenceValue: 420, averageScore: 4.5, observations: 'Confiável.', experienceWithV3A: true },
  { id: 'free-12', name: 'Patricia Ramos', email: 'patricia.r@v3a.com', whatsapp: '(21) 93456-7890', city: 'Niterói', state: 'RJ', mainRole: 'Atendimento', secondaryRoles: [], seniority: 'Pleno', industries: ['Bebidas', 'Beleza'], portfolioUrl: 'link.com', status: 'Elegível', availability: 'Imediata', referenceValue: 480, averageScore: 4.6, observations: 'Bom trato.', experienceWithV3A: true },
  { id: 'free-13', name: 'Julio Castela', email: 'julio.c@v3a.com', whatsapp: '(31) 94567-8901', city: 'Belo Horizonte', state: 'MG', mainRole: 'Planejamento', secondaryRoles: [], seniority: 'Pleno', industries: ['Varejo'], portfolioUrl: 'link.com', status: 'Em observação', availability: 'Imediata', referenceValue: 500, averageScore: 3.4, observations: 'Problemas de prazo.', experienceWithV3A: true },
  { id: 'free-14', name: 'Bruna Marquez', email: 'bruna.m@v3a.com', whatsapp: '(11) 95678-9012', city: 'São Paulo', state: 'SP', mainRole: 'Diretor de Arte', secondaryRoles: [], seniority: 'Sênior', industries: ['Beleza'], portfolioUrl: 'link.com', status: 'Inativo', availability: 'Indisponível', referenceValue: 680, averageScore: 4.8, observations: 'Desligado a pedido.', experienceWithV3A: true },
  { id: 'free-15', name: 'Renato Gaúcho', email: 'renato.g@v3a.com', whatsapp: '(51) 96789-0123', city: 'Porto Alegre', state: 'RS', mainRole: 'Produtor Executivo', secondaryRoles: [], seniority: 'Sênior', industries: ['Entretenimento'], portfolioUrl: 'link.com', status: 'Elegível', availability: '30+ dias', referenceValue: 800, averageScore: 4.7, observations: 'Muito experiente.', experienceWithV3A: true },
  { id: 'free-16', name: 'Larissa Manoela', email: 'larissa.m@v3a.com', whatsapp: '(11) 97890-1234', city: 'São Paulo', state: 'SP', mainRole: 'Conteúdo', secondaryRoles: [], seniority: 'Júnior', industries: ['Entretenimento', 'Beleza'], portfolioUrl: 'link.com', status: 'Elegível', availability: 'Imediata', referenceValue: 320, averageScore: 4.3, observations: 'Boa escrita.', experienceWithV3A: false },
  { id: 'free-17', name: 'Felipe Neto', email: 'felipe.n@v3a.com', whatsapp: '(21) 98901-2345', city: 'Rio de Janeiro', state: 'RJ', mainRole: 'Redator', secondaryRoles: [], seniority: 'Pleno', industries: ['Tecnologia'], portfolioUrl: 'link.com', status: 'Elegível', availability: 'Imediata', referenceValue: 450, averageScore: 4.5, observations: 'Revisões rápidas.', experienceWithV3A: true },
  { id: 'free-18', name: 'Gisele Bündchen', email: 'gisele.b@v3a.com', whatsapp: '(11) 99012-3456', city: 'São Paulo', state: 'SP', mainRole: 'Diretor de Arte', secondaryRoles: [], seniority: 'Especialista', industries: ['Beleza', 'Varejo'], portfolioUrl: 'link.com', status: 'Elegível', availability: '15 dias', referenceValue: 1000, averageScore: 4.9, observations: 'Incrível identidade visual.', experienceWithV3A: true },
  { id: 'free-19', name: 'Neymar Junior', email: 'neymar.j@v3a.com', whatsapp: '(13) 91234-5678', city: 'Santos', state: 'SP', mainRole: 'Produtor de Campo', secondaryRoles: [], seniority: 'Júnior', industries: ['Entretenimento'], portfolioUrl: 'link.com', status: 'Elegível', availability: 'Imediata', referenceValue: 350, averageScore: 4.1, observations: 'Impulsivo mas dedicado.', experienceWithV3A: false },
  { id: 'free-20', name: 'Marta Vieira', email: 'marta.v@v3a.com', whatsapp: '(82) 92345-6789', city: 'Maceio', state: 'AL', mainRole: 'Produtor Executivo', secondaryRoles: [], seniority: 'Especialista', industries: ['Entretenimento'], portfolioUrl: 'link.com', status: 'Elegível', availability: 'Imediata', referenceValue: 1200, averageScore: 5.0, observations: 'A melhor do Brasil.', experienceWithV3A: true }
];

export const initialJobs: Job[] = [
  {
    id: 'job-1',
    jobCode: '26-0042-001',
    job_code: '26-0042-001',
    name: 'Stand de Lançamento Autotech',
    client: 'AutoCorp Brasil',
    nucleoId: 'nuc-1', // Tecnologia
    requesterId: 'usr-4',
    roleNeeded: 'Designer 3D',
    seniorityNeeded: 'Sênior',
    description: 'Criação do projeto de stands 3D interativos e holografia para a feira de automóveis Autotech 2026.',
    deliverables: 'Formatos FBX do stand completo, plantas de montagem e renders em alta definição das ativações virtuais.',
    startDate: '2026-06-10',
    endDate: '2026-06-25',
    budget: 25000,
    urgency: 'Alta',
    status: 'Bookado',
  },
  {
    id: 'job-2',
    jobCode: '26-0042-002',
    job_code: '26-0042-002',
    name: 'Campanha de Ativação Energético',
    client: 'Energy Drinks Ltd',
    nucleoId: 'nuc-2', // Marketing
    requesterId: 'usr-5',
    roleNeeded: 'Redator',
    seniorityNeeded: 'Pleno',
    description: 'Criação de scripts detalhados, slogans e chamadas para ativação urbana física e promoção em faculdades.',
    deliverables: 'Roteiros de 5 dinâmicas interativas, textos para hotsite e posts patrocinados.',
    startDate: '2026-06-12',
    endDate: '2026-06-20',
    budget: 12000,
    urgency: 'Média',
    status: 'Concluído',
  },
  {
    id: 'job-3',
    jobCode: '26-0042-003',
    job_code: '26-0042-003',
    name: 'Renovação de Identidade Visual Corporativa',
    client: 'Finance Group',
    nucleoId: 'nuc-3', // Design & Criação
    requesterId: 'usr-6',
    roleNeeded: 'Diretor de Arte',
    seniorityNeeded: 'Sênior',
    description: 'Redesenho completo das diretrizes visuais e painéis corporativos de apresentação para rodadas de fundos.',
    deliverables: 'Brandbook atualizado, templates de pitch deck, logos vetoriais em alta.',
    startDate: '2026-05-15',
    endDate: '2026-06-01',
    budget: 18000,
    urgency: 'Média',
    status: 'Encerrado',
  },
  {
    id: 'job-4',
    jobCode: '26-0042-004',
    job_code: '26-0042-004',
    name: 'Mega Stand de Games na CCXP',
    client: 'GamerZone S.A.',
    nucleoId: 'nuc-5', // Produção Executiva
    requesterId: 'usr-4',
    roleNeeded: 'Produtor Executivo',
    seniorityNeeded: 'Sênior',
    description: 'Gestão completa da contratação de som, luz, segurança, montadoras e interações com gamers na feira.',
    deliverables: 'Cronograma executivo, matriz de riscos aprovada, fechamento de fornecedores.',
    startDate: '2026-06-15',
    endDate: '2026-06-30',
    budget: 45000,
    urgency: 'Alta',
    status: 'Oportunidade criada',
  },
  {
    id: 'job-5',
    jobCode: '26-0042-005',
    job_code: '26-0042-005',
    name: 'Roteiro e Ativação Copacabana',
    client: 'Cervejaria Premium',
    nucleoId: 'nuc-2', // Marketing
    requesterId: 'usr-5',
    roleNeeded: 'Redator',
    seniorityNeeded: 'Pleno',
    description: 'Ativação de praia de grande porte no feriado de julho. Roteiros de palco de stand e locução.',
    deliverables: 'Guia de locução e interações, textos de cenografia.',
    startDate: '2026-06-15',
    endDate: '2026-06-19',
    budget: 8000,
    urgency: 'Média',
    status: 'Em shortlist',
  },
  {
    id: 'job-6',
    jobCode: '26-0042-006',
    job_code: '26-0042-006',
    name: 'Palco Futurista AgroFeira',
    client: 'Sementes Brasil',
    nucleoId: 'nuc-3', // Design & Criação
    requesterId: 'usr-6',
    roleNeeded: 'Diretor de Arte',
    seniorityNeeded: 'Sênior',
    description: 'Concepção do layout 3D e identidade integrada do palco central da AgroFeira.',
    deliverables: 'Ideias espaciais e aprovação de cenografia conjunta.',
    startDate: '2026-06-18',
    endDate: '2026-06-25',
    budget: 15000,
    urgency: 'Média',
    status: 'Em negociação',
  },
  {
    id: 'job-7',
    jobCode: '26-0042-007',
    job_code: '26-0042-007',
    name: 'Lançamento Cosméticos Glow',
    client: 'Glow Cosmetics',
    nucleoId: 'nuc-2', // Marketing
    requesterId: 'usr-5',
    roleNeeded: 'Planejamento',
    seniorityNeeded: 'Pleno',
    description: 'Planejamento conceitual e estratégico da ativação itinerante de beleza em shoppings do Sul.',
    deliverables: 'Apresentação detalhada do conceito de ativação (Glow Experience).',
    startDate: '2026-06-03',
    endDate: '2026-06-18',
    budget: 14000,
    urgency: 'Média',
    status: 'Aguardando RH',
  },
  {
    id: 'job-8',
    jobCode: '26-0042-008',
    job_code: '26-0042-008',
    name: 'Convenção de Tecnologia Core',
    client: 'Core Tech',
    nucleoId: 'nuc-1', // Tecnologia
    requesterId: 'usr-4',
    roleNeeded: 'Designer 3D',
    seniorityNeeded: 'Sênior',
    description: 'Projeto de palco e projeção mapeada interativa.',
    deliverables: 'Renders 3d e storyboards da projeção.',
    startDate: '2026-06-01',
    endDate: '2026-06-12',
    budget: 20000,
    urgency: 'Alta',
    status: 'Em andamento',
  },
  {
    id: 'job-9',
    jobCode: '26-0042-009',
    job_code: '26-0042-009',
    name: 'Roadshow Beleza Rápida',
    client: 'Beleza S.A.',
    nucleoId: 'nuc-3', // Design & Criação
    requesterId: 'usr-6',
    roleNeeded: 'Diretor de Arte',
    seniorityNeeded: 'Sênior',
    description: 'Identidade visual de painéis de merchandising para carretas de beleza itinerante.',
    deliverables: 'Arquivos PDF de alta definição e manual de aplicação física.',
    startDate: '2026-05-10',
    endDate: '2026-05-28',
    budget: 11000,
    urgency: 'Alta',
    status: 'Avaliação pendente',
  },
  {
    id: 'job-10',
    jobCode: '26-0042-010',
    job_code: '26-0042-010',
    name: 'Hotsite e Ativação AgroFest',
    client: 'AgroFest Corp',
    nucleoId: 'nuc-1', // Tecnologia
    requesterId: 'usr-4',
    roleNeeded: 'Planejamento',
    seniorityNeeded: 'Pleno',
    description: 'Planejamento integrado de ativação digital conectando o stand físico ao app oficial.',
    deliverables: 'Fluxograma da experiência omnichannel.',
    startDate: '2026-06-14',
    endDate: '2026-06-21',
    budget: 9500,
    urgency: 'Baixa',
    status: 'Oportunidade criada',
  },
];

export const initialShortlists: Shortlist[] = [
  // Stand Autotech (job-1) - Bookado Carlos Silva
  { id: 'short-1', jobId: 'job-1', freelancerId: 'free-1', candidateStatus: 'Aprovado pelo RH' },
  // Stand Autotech (job-1) - Outros candidatos
  { id: 'short-2', jobId: 'job-1', freelancerId: 'free-9', candidateStatus: 'Indisponível' },
  
  // Campanha Energético (job-2) - Concluído Bruna/Fernanda
  { id: 'short-3', jobId: 'job-2', freelancerId: 'free-8', candidateStatus: 'Aprovado pelo RH' },
  
  // Renovação Identidade (job-3) - Encerrado João Pedro
  { id: 'short-4', jobId: 'job-3', freelancerId: 'free-3', candidateStatus: 'Aprovado pelo RH' },
  
  // Roteiro Copacabana (job-5)
  { id: 'short-5', jobId: 'job-5', freelancerId: 'free-8', candidateStatus: 'Selecionado' },
  { id: 'short-6', jobId: 'job-5', freelancerId: 'free-17', candidateStatus: 'Selecionado' },
  
  // Palco Futurista (job-6)
  { id: 'short-7', jobId: 'job-6', freelancerId: 'free-3', candidateStatus: 'Em negociação' },
  { id: 'short-8', jobId: 'job-6', freelancerId: 'free-18', candidateStatus: 'Valor fora da política' }, // Acima do teto padrão!
  
  // Lançamento Cosméticos (job-7)
  { id: 'short-9', jobId: 'job-7', freelancerId: 'free-2', candidateStatus: 'Em negociação' },
  { id: 'short-10', jobId: 'job-7', freelancerId: 'free-13', candidateStatus: 'Selecionado' }
];

export const initialNegotiations: Negotiation[] = [
  // Palco Futurista (free-3)
  { id: 'neg-1', jobId: 'job-6', freelancerId: 'free-3', negotiatedValue: 650, billingType: 'Diária', scope: 'Criação do visual de palco e aprovação de montadora.', status: 'Em andamento' },
  // Palco Futurista (free-18) - Acima do teto política! (ceiling: 800, negociado: 1100)
  { 
    id: 'neg-2', 
    jobId: 'job-6', 
    freelancerId: 'free-18', 
    negotiatedValue: 1100, 
    billingType: 'Diária', 
    scope: 'Concepção do palco principal por arquiteta renomada.', 
    status: 'Pendente aprovação RH',
    justificationIfAbovePolicy: 'Profissional especialista nacional em cenografia de grande porte, solicitada pela marca titular como exigência de patrocínio.'
  },
  
  // Lançamento Cosméticos (free-2)
  { id: 'neg-3', jobId: 'job-7', freelancerId: 'free-2', negotiatedValue: 550, billingType: 'Diária', scope: 'Estruturação conceitual do projeto e acompanhamento no Sul.', status: 'Em andamento' },
  // Stand Autotech (free-1)
  { id: 'neg-4', jobId: 'job-1', freelancerId: 'free-1', negotiatedValue: 850, billingType: 'Diária', scope: 'Visual 3D de stands imersivos e realidade virtual.', status: 'Aprovado pelo RH', justificationIfAbovePolicy: 'Valor acima do teto de referência do Designer 3D convencional devido às exigências de programação WebGL complexa e holografias e prazos curtíssimos.' },
  // Campanha Energético (free-8)
  { id: 'neg-5', jobId: 'job-2', freelancerId: 'free-8', negotiatedValue: 480, billingType: 'Diária', scope: 'Slogans da ativação urbana.', status: 'Aprovado pelo RH' },
  // Renovação Identidade (free-3)
  { id: 'neg-6', jobId: 'job-3', freelancerId: 'free-3', negotiatedValue: 650, billingType: 'Diária', scope: 'Brandbook e pitch deck corporativos.', status: 'Aprovado pelo RH' },
  // Convenção Tech (free-1)
  { id: 'neg-7', jobId: 'job-8', freelancerId: 'free-1', negotiatedValue: 800, billingType: 'Diária', scope: 'Projeção mapeada.', status: 'Aprovado pelo RH' },
  // Roadshow Beleza (free-18) - Acima do teto (negociado: 1200, ceiling: 800)
  { 
    id: 'neg-8', 
    jobId: 'job-9', 
    freelancerId: 'free-18', 
    negotiatedValue: 1200, 
    billingType: 'Diária', 
    scope: 'Roadshow.', 
    status: 'Aprovado pelo RH', 
    justificationIfAbovePolicy: 'Necessidade pontual indisponível no mercado para início imediato na carreta itinerante.' 
  },
];

export const initialAllocations: Allocation[] = [
  // Carlos Silva no Stand Autotech (Active Booking)
  { id: 'alloc-1', allocationCode: 'ALOC-2026-0001', jobCode: '26-0042-001', job_code: '26-0042-001', jobId: 'job-1', freelancerId: 'free-1', nucleoId: 'nuc-1', startDate: '2026-06-10', endDate: '2026-06-25', approvedValue: 850, status: 'Ativo' },
  // Fernanda Lima na Campanha Energético (Completed)
  { id: 'alloc-2', allocationCode: 'ALOC-2026-0002', jobCode: '26-0042-002', job_code: '26-0042-002', jobId: 'job-2', freelancerId: 'free-8', nucleoId: 'nuc-2', startDate: '2026-06-12', endDate: '2026-06-20', approvedValue: 480, status: 'Concluído' },
  // João Pedro na Renovação Identidade (Completed)
  { id: 'alloc-3', allocationCode: 'ALOC-2026-0003', jobCode: '26-0042-003', job_code: '26-0042-003', jobId: 'job-3', freelancerId: 'free-3', nucleoId: 'nuc-3', startDate: '2026-05-15', endDate: '2026-06-01', approvedValue: 650, status: 'Concluído' },
  // Carlos Silva na Convenção Tech (Active Booking - agenda overlaps with alloc-1!)
  { id: 'alloc-4', allocationCode: 'ALOC-2026-0004', jobCode: '26-0042-008', job_code: '26-0042-008', jobId: 'job-8', freelancerId: 'free-1', nucleoId: 'nuc-1', startDate: '2026-06-01', endDate: '2026-06-12', approvedValue: 800, status: 'Ativo' },
  // Gisele Bündchen no Roadshow Beleza (Concluído, pendente de avaliação)
  { id: 'alloc-5', allocationCode: 'ALOC-2026-0005', jobCode: '26-0042-009', job_code: '26-0042-009', jobId: 'job-9', freelancerId: 'free-18', nucleoId: 'nuc-3', startDate: '2026-05-10', endDate: '2026-05-28', approvedValue: 1200, status: 'Concluído' },
  // Roberto Alves no megastand ccxp (Pendente)
  { id: 'alloc-6', allocationCode: 'ALOC-2026-0006', jobCode: '26-0042-004', job_code: '26-0042-004', jobId: 'job-4', freelancerId: 'free-7', nucleoId: 'nuc-5', startDate: '2026-06-15', endDate: '2026-06-30', approvedValue: 450, status: 'Pendente' },
  { id: 'alloc-7', allocationCode: 'ALOC-2026-0007', jobCode: '26-0042-007', job_code: '26-0042-007', jobId: 'job-7', freelancerId: 'free-2', nucleoId: 'nuc-2', startDate: '2026-06-03', endDate: '2026-06-18', approvedValue: 550, status: 'Ativo' },
];

export const initialEvaluations: Evaluation[] = [
  // Evaluation on Job 3 (João Pedro) by Lucas Borges
  {
    id: 'eval-1',
    jobId: 'job-3',
    freelancerId: 'free-3',
    evaluatorId: 'usr-6',
    technicalQuality: 5,
    deadline: 4,
    briefingAdherence: 5,
    communication: 4.5,
    autonomy: 5,
    behavior: 5,
    finalScore: 4.77,
    comment: 'Entrega impecável de layouts corporativos. Teve pequeno atraso na primeira rodada por causa do cliente, mas recuperou muito bem na entrega final.',
    recommendation: 'Sim',
  },
  // Outras avaliações históricas para robustez
  {
    id: 'eval-2',
    jobId: 'job-2',
    freelancerId: 'free-8',
    evaluatorId: 'usr-5',
    technicalQuality: 5,
    deadline: 5,
    briefingAdherence: 4,
    communication: 5,
    autonomy: 5,
    behavior: 5,
    finalScore: 4.85,
    comment: 'Roteiros de ativação urbana vibrantes e ágeis. Recomendo fortemente.',
    recommendation: 'Sim',
  },
];

export const initialPaymentCodes: PaymentCode[] = [
  // paymentCode generated matching actual allocations
  { id: 'pay-1', allocationCode: 'ALOC-2026-0001', jobId: 'job-1', freelancerId: 'free-1', approvedValue: 850, paymentStatus: 'Aguardando conclusão do job' },
  { id: 'pay-2', allocationCode: 'ALOC-2026-0002', jobId: 'job-2', freelancerId: 'free-8', approvedValue: 480, paymentStatus: 'Liberado para pagamento' }, // Alocado + Concluído + Avaliado
  { id: 'pay-3', allocationCode: 'ALOC-2026-0003', jobId: 'job-3', freelancerId: 'free-3', approvedValue: 650, paymentStatus: 'Liberado para pagamento' }, // Alocado + Concluído + Avaliado
  { id: 'pay-4', allocationCode: 'ALOC-2026-0004', jobId: 'job-8', freelancerId: 'free-1', approvedValue: 800, paymentStatus: 'Aguardando conclusão do job' },
  { id: 'pay-5', allocationCode: 'ALOC-2026-0005', jobId: 'job-9', freelancerId: 'free-18', approvedValue: 1200, paymentStatus: 'Aguardando avaliação' }, // Concluído mas sem avaliação!
  { id: 'pay-6', allocationCode: 'ALOC-2026-0006', jobId: 'job-4', freelancerId: 'free-7', approvedValue: 450, paymentStatus: 'Aguardando conclusão do job' },
];

export const initialSuggestions: Suggestion[] = [
  {
    id: 'sug-1',
    freelancerName: 'Mariana Costa',
    email: 'mariana.costa@v3a.com',
    whatsapp: '(11) 97711-2233',
    suggestedRole: 'Conteúdo',
    portfolioUrl: 'medium.com/maricosta',
    reason: 'Indicada para o projeto Coca-Cola FanFest devido à sua bagagem excelente em mídias de festivais musicais.',
    relatedProject: 'Stand Coca-Cola Fest',
    observations: 'Disponibilidade imediata e rate de diária bem atrativo.',
    nucleoId: 'nuc-2',
    suggestedBy: 'Ana Lima (Marketing)',
    status: 'Pendente de análise RH',
  },
  {
    id: 'sug-2',
    freelancerName: 'Rafael Souza',
    email: 'rafa.souza@gmail.com',
    whatsapp: '(21) 98765-1100',
    suggestedRole: 'Produtor de Campo',
    portfolioUrl: 'flickr.com/rafasouzaprod',
    reason: 'Ótimo produtor de credenciamento e backstage na CCXP Rio.',
    relatedProject: 'CCXP Rio 2026',
    nucleoId: 'nuc-5',
    suggestedBy: 'Ricardo Lemos (Produção)',
    status: 'Pendente de análise RH',
  },
];
