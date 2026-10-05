'use client';

import React, { useState, useEffect } from 'react';
import { 
  initialUsers, 
  initialNucleos, 
  initialValuePolicies, 
  initialFreelancers, 
  initialJobs, 
  initialShortlists, 
  initialNegotiations, 
  initialAllocations, 
  initialEvaluations, 
  initialPaymentCodes, 
  Freelancer,
  Job,
  Shortlist,
  Negotiation,
  ValuePolicy,
  Allocation,
  Evaluation,
  PaymentCode,
  Nucleo,
  User,
  AllocationPaymentSchedule,
  PaymentRequest,
  ValueExceptionApproval,
  JobSuccessFeeRule,
  AllocationSuccessFee
} from '@/lib/mockData';

// Supabase and Server Actions
import { supabase } from '@/lib/supabase';
import { 
  mapProfileToUser, 
  mapNucleoToUI, 
  mapFreelancerToUI, 
  mapValuePolicyToUI, 
  mapAllocationToUI, 
  mapEvaluationToUI, 
  mapPaymentCodeToUI, 
  mapJobToUI,
  mapSeniorityToDB,
  mapFreelancerStatusToDB,
  mapAvailabilityToDB,
  mapJobStatusToDB,
  mapCandidateStatusToDB,
  mapCandidateStatusToDBEnum,
  mapBillingTypeToDB,
  mapAllocationStatusToDB,
  mapCandidateStatusToUI,
  mapBillingTypeToUI,
  mapNegotiationStatusToUI,
  mapUrgencyToDB,
  getRoleLabel,
  mapAllocationPaymentScheduleToUI,
  mapPaymentRequestToUI,
  mapValueExceptionApprovalToUI
} from '@/lib/dbMapper';
import { 
  createUserAction, 
  resetUserPasswordAction, 
  updateOwnPasswordAction 
} from '@/app/actions/admin';
import { can, hasDataScope } from '@/lib/permissions';

// Import subcomponents
import DashboardMaster from '@/components/DashboardMaster';
import DashboardRh from '@/components/DashboardRh';
import DashboardNucleo from '@/components/DashboardNucleo';
import DashboardOperacao from '@/components/DashboardOperacao';
import BancoFreelas from '@/components/BancoFreelas';
import PerfilFreela from '@/components/PerfilFreela';
import TimelineAlocacoes from '@/components/TimelineAlocacoes';
import { FormFreela, FormOportunidade } from '@/components/Formularios';
import ShortlistPanel from '@/components/ShortlistPanel';
import ExcecaoPanel from '@/components/ExcecaoPanel';
import PaymentCodesPanel from '@/components/PaymentCodesPanel';
import EvaluationForm from '@/components/EvaluationForm';
import RelatoriosPanel from '@/components/RelatoriosPanel';
import NucleosPanel from '@/components/NucleosPanel';
import UserManagement from '@/components/UserManagement';
import PerfilUsuario from '@/components/PerfilUsuario';
import BrandLogo from '@/components/BrandLogo';
import SidebarBrand from '@/components/SidebarBrand';
import PublicLinksPanel from '@/components/PublicLinksPanel';
import PublicSubmissionsPanel from '@/components/PublicSubmissionsPanel';
import BookingsPanel from '@/components/BookingsPanel';
import Base3DPanel from '@/components/Base3DPanel';

// Icons for navigation
import { 
  LayoutDashboard, 
  Users, 
  UserCog,
  Contact,
  Briefcase, 
  FolderPlus,
  Handshake,
  CalendarDays, 
  CalendarCheck,
  CalendarRange,
  FileCheck2, 
  Scale, 
  TrendingUp, 
  Building, 
  LogOut, 
  UserSquare2, 
  Key, 
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Award,
  Lock,
  UserCheck,
  Eye,
  AlertTriangle,
  QrCode,
  Sun,
  Moon,
  Monitor,
  Menu,
  X as XIcon,
  ShieldAlert,
  ChevronDown,
  Check,
  Box
} from 'lucide-react';

import { useTheme } from '@/components/ThemeProvider';

export interface DatabaseProps {
  freelancers: Freelancer[];
  setFreelancers: React.Dispatch<React.SetStateAction<Freelancer[]>>;
  setFreelancersState?: React.Dispatch<React.SetStateAction<Freelancer[]>>;
  jobs: Job[];
  setJobs: React.Dispatch<React.SetStateAction<Job[]>>;
  shortlists: Shortlist[];
  setShortlists: React.Dispatch<React.SetStateAction<Shortlist[]>>;
  negotiations: Negotiation[];
  setNegotiations: React.Dispatch<React.SetStateAction<Negotiation[]>>;
  policies: ValuePolicy[];
  setPolicies: React.Dispatch<React.SetStateAction<ValuePolicy[]>>;
  allocations: Allocation[];
  setAllocations: React.Dispatch<React.SetStateAction<Allocation[]>>;
  evaluations: Evaluation[];
  setEvaluations: React.Dispatch<React.SetStateAction<Evaluation[]>>;
  paymentCodes: PaymentCode[];
  setPaymentCodes: React.Dispatch<React.SetStateAction<PaymentCode[]>>;
  jobSuccessFeeRules?: JobSuccessFeeRule[];
  setJobSuccessFeeRules?: React.Dispatch<React.SetStateAction<JobSuccessFeeRule[]>>;
  allocationSuccessFees?: AllocationSuccessFee[];
  setAllocationSuccessFees?: React.Dispatch<React.SetStateAction<AllocationSuccessFee[]>>;

  nucleos: Nucleo[];
  setNucleos: React.Dispatch<React.SetStateAction<Nucleo[]>>;
  approvals: any[];
  setApprovals: React.Dispatch<React.SetStateAction<any[]>>;
  valueExceptionApprovals: ValueExceptionApproval[];
  setValueExceptionApprovals: React.Dispatch<React.SetStateAction<ValueExceptionApproval[]>>;
  reverseEvaluations: any[];
  setReverseEvaluations: React.Dispatch<React.SetStateAction<any[]>>;
  paymentSchedules: AllocationPaymentSchedule[];
  setPaymentSchedules: React.Dispatch<React.SetStateAction<AllocationPaymentSchedule[]>>;
  paymentRequests: PaymentRequest[];
  setPaymentRequests: React.Dispatch<React.SetStateAction<PaymentRequest[]>>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  reloadDatabase: () => Promise<void>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedFreelancerId: string | null;
  setSelectedFreelancerId: (id: string | null) => void;
  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;
  currentUser: User;
  setCurrentUser: any;
}

const isUuid = (id: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
};

export default function Home() {
  // Global reactive database states
  const [usersState, setUsersState] = useState<User[]>(initialUsers);
  const [freelancersState, setFreelancersState] = useState<Freelancer[]>(initialFreelancers);
  const [jobsState, setJobsState] = useState<Job[]>(initialJobs);
  const [shortlistsState, setShortlistsState] = useState<Shortlist[]>(initialShortlists);
  const [negotiationsState, setNegotiationsState] = useState<Negotiation[]>(initialNegotiations);
  const [policiesState, setPoliciesState] = useState<ValuePolicy[]>(initialValuePolicies);
  const [allocationsState, setAllocationsState] = useState<Allocation[]>(initialAllocations);
  const [evaluationsState, setEvaluationsState] = useState<Evaluation[]>(initialEvaluations);
  const [paymentCodesState, setPaymentCodesState] = useState<PaymentCode[]>(initialPaymentCodes);

  const [nucleosState, setNucleosState] = useState<Nucleo[]>(initialNucleos);
  const [approvalsState, setApprovalsState] = useState<any[]>([]);
  const [valueExceptionApprovalsState, setValueExceptionApprovalsState] = useState<ValueExceptionApproval[]>([]);
  const [reverseEvaluationsState, setReverseEvaluationsState] = useState<any[]>([]);
  const [paymentSchedulesState, setPaymentSchedulesState] = useState<AllocationPaymentSchedule[]>([]);
  const [paymentRequestsState, setPaymentRequestsState] = useState<PaymentRequest[]>([]);
  const [jobSuccessFeeRules, setJobSuccessFeeRules] = useState<JobSuccessFeeRule[]>([]);
  const [allocationSuccessFees, setAllocationSuccessFees] = useState<AllocationSuccessFee[]>([]);

  // Auth credential states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Compulsory Password Change Form states (First Access)
  const [compulsoryCurrentPassword, setCompulsoryCurrentPassword] = useState('');
  const [compulsoryNewPassword, setCompulsoryNewPassword] = useState('');
  const [compulsoryConfirmPassword, setCompulsoryConfirmPassword] = useState('');
  const [compulsoryError, setCompulsoryError] = useState<string | null>(null);
  const [isCompulsorySubmitting, setIsCompulsorySubmitting] = useState(false);

  // Theme state
  const { theme, setTheme } = useTheme();

  // Sync theme when user logs in or session is restored
  useEffect(() => {
    if (currentUser?.themePreference) {
      setTheme(currentUser.themePreference, true);
    }
  }, [currentUser]);

  // App Layout States
  const [activeTab, setActiveTab2] = useState('Dashboard');
  const [selectedFreelancerId, setSelectedFreelancerId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const jobIdParam = params.get('jobId');
      if (tabParam) {
        setActiveTab(tabParam);
      }
      if (jobIdParam) {
        setSelectedJobId(jobIdParam);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Profile Simulation / Role Switcher for MASTER users
  const [simulatedProfile, setSimulatedProfile] = useState<string | null>(null);
  const [realMasterUser, setRealMasterUser] = useState<User | null>(null);
  const [isRoleSwitcherOpen, setIsRoleSwitcherOpen] = useState(false);

  // Sync realMasterUser state with currentUser
  useEffect(() => {
    if (currentUser) {
      const currentRole = getRoleLabel(currentUser.profile);
      if (currentRole === 'MASTER') {
        if (!realMasterUser || realMasterUser.id !== currentUser.id) {
          setRealMasterUser(currentUser);
        }
      } else {
        // If currentUser is not MASTER, check if realMasterUser matches this same user ID (meaning MASTER is simulating another role)
        if (realMasterUser && realMasterUser.id === currentUser.id) {
          // Keep realMasterUser intact as MASTER is simulating another role
        } else {
          // This is a non-MASTER account or a different user -> reset simulation & real master
          if (realMasterUser) setRealMasterUser(null);
          if (simulatedProfile) setSimulatedProfile(null);
        }
      }
    } else {
      if (realMasterUser) setRealMasterUser(null);
      if (simulatedProfile) setSimulatedProfile(null);
    }
  }, [currentUser, realMasterUser, simulatedProfile]);

  const isMasterAccount = Boolean(
    currentUser && (
      getRoleLabel(currentUser.profile) === 'MASTER' ||
      (realMasterUser && realMasterUser.id === currentUser.id && getRoleLabel(realMasterUser.profile) === 'MASTER')
    )
  );

  const handleSwitchProfile = (targetProfile: string) => {
    if (!currentUser || !isMasterAccount) return;
    if (!realMasterUser && getRoleLabel(currentUser.profile) === 'MASTER') {
      setRealMasterUser(currentUser);
    }

    if (targetProfile === 'MASTER') {
      setSimulatedProfile(null);
      setCurrentUser(prev => prev ? { ...prev, profile: 'MASTER' as any } : null);
    } else {
      setSimulatedProfile(targetProfile);
      setCurrentUser(prev => prev ? { ...prev, profile: targetProfile as any } : null);
    }
    setActiveTab('Dashboard');
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const collapsed = localStorage.getItem('freela_hub_sidebar_collapsed');
      if (collapsed === 'true') {
        setIsSidebarCollapsed(true);
      }
    }
  }, []);

  const toggleSidebar = () => {
    const nextVal = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextVal);
    localStorage.setItem('freela_hub_sidebar_collapsed', String(nextVal));
  };

  const setActiveTab = (tab: string) => {
    // Reload database on tab navigation to avoid stale data
    reloadDatabase().catch(err => console.error('Database reload error on tab switch:', err));

    // Scroll main viewport container to top on tab change
    if (typeof window !== 'undefined') {
      const container = document.getElementById('main-scroll-container');
      if (container) container.scrollTop = 0;
      window.scrollTo(0, 0);
    }

    if (tab === 'Sugerir Freelancer' || tab === 'Sugestões de Freelas') {
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', 'Links Públicos / QR Codes');
        window.history.replaceState({}, '', url.toString());
        alert('As indicações e sugestões de freelancers agora são realizadas através de Links Públicos / QR Codes.');
      }
      setActiveTab2('Links Públicos / QR Codes');
      setSelectedFreelancerId(null);
      setIsHeaderMenuOpen(false);
      setIsMobileMenuOpen(false);
      return;
    }
    setActiveTab2(tab);
    if (tab !== 'Perfil do Freelancer') {
      setSelectedFreelancerId(null);
    }
    if (tab === 'Shortlist' || tab === 'Shortlist & Negociação') {
      setSelectedJobId(null);
    }
    setIsHeaderMenuOpen(false);
    setIsMobileMenuOpen(false); // close drawer on navigation
  };

  // Helper functions to map DB ids on inserts
  const getFunctionIdByName = async (name: string): Promise<string | null> => {
    const { data } = await supabase
      .from('freela_functions')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    if (data) return data.id;
    
    const { data: created } = await supabase
      .from('freela_functions')
      .insert({ name })
      .select('id')
      .single();
    return created?.id || null;
  };

  const getIndustryIdByName = async (name: string): Promise<string | null> => {
    const { data } = await supabase
      .from('industries')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    if (data) return data.id;

    const { data: created } = await supabase
      .from('industries')
      .insert({ name })
      .select('id')
      .single();
    return created?.id || null;
  };

  // Load database from Supabase
  const loadDatabaseFromSupabase = async (user: User, token: string) => {
    try {
      const { data: dbProfiles } = await supabase.from('profiles').select('*');
      if (dbProfiles) {
        setUsersState(dbProfiles.map(mapProfileToUser));
      }

      const { data: dbNucleos } = await supabase.from('nucleos').select('*');
      if (dbNucleos) {
        setNucleosState(dbNucleos.map(mapNucleoToUI));
      }

      const { data: dbFreelancers } = await supabase
        .from('freelancers')
        .select('*, main_function:freela_functions(name), freelancer_industries(industry:industries(name))')
        .is('merged_into_freelancer_id', null);
      if (dbFreelancers) {
        setFreelancersState(dbFreelancers.map(mapFreelancerToUI));
      }

      const { data: dbPolicies } = await supabase
        .from('rate_policies')
        .select('*, function:freela_functions(name)');
      if (dbPolicies) {
        setPoliciesState(dbPolicies.map(mapValuePolicyToUI));
      }

      const { data: dbRequests } = await supabase
        .from('job_freelancer_requests')
        .select('*, jobs(*), freela_functions(*)');
      if (dbRequests) {
        const mappedJobs = dbRequests.map(mapJobToUI);
        setJobsState(mappedJobs);
      }

      const { data: dbShortlists } = await supabase.from('shortlist_candidates').select('*');
      if (dbShortlists) {
        setShortlistsState(
          dbShortlists.map((sc: any) => ({
            id: sc.id,
            jobId: sc.request_id,
            freelancerId: sc.freelancer_id,
            candidateStatus: mapCandidateStatusToUI(sc.negotiation_status || sc.candidate_status),
            notes: sc.notes || '',
            negotiationStatus: mapCandidateStatusToUI(sc.negotiation_status || sc.candidate_status),
            negotiatedRate: Number(sc.negotiated_rate || 0),
            remunerationModel: mapBillingTypeToUI(sc.remuneration_model),
            policyStatus: sc.policy_status || 'pending_check',
            scheduleConflict: sc.schedule_conflict || false,
            requiresRhApproval: sc.requires_rh_approval || false,
            requiresHeadApproval: sc.requires_head_approval || false,
            selectedForAllocation: sc.selected_for_allocation || false,
            sourceBucket: sc.source_bucket || 'manual',
            matchScore: sc.match_score || 0,
            recommendationReasons: sc.recommendation_reasons || [],
            shortlistPosition: sc.shortlist_position || 0,
            negotiatedTotal: sc.negotiated_total !== null && sc.negotiated_total !== undefined ? Number(sc.negotiated_total) : undefined,
            budgetSavingAmount: sc.budget_saving_amount !== null && sc.budget_saving_amount !== undefined ? Number(sc.budget_saving_amount) : undefined,
            budgetSavingPercentage: sc.budget_saving_percentage !== null && sc.budget_saving_percentage !== undefined ? Number(sc.budget_saving_percentage) : undefined,
            dailyBudgetReference: sc.daily_budget_reference !== null && sc.daily_budget_reference !== undefined ? Number(sc.daily_budget_reference) : undefined,
            dailySavingAmount: sc.daily_saving_amount !== null && sc.daily_saving_amount !== undefined ? Number(sc.daily_saving_amount) : undefined,
            budgetDeltaStatus: sc.budget_delta_status || 'not_calculated',
            estimatedHours: sc.estimated_hours !== null && sc.estimated_hours !== undefined ? Number(sc.estimated_hours) : undefined,
            scheduleApprovalId: sc.schedule_approval_id || null,
            valueApprovalId: sc.value_approval_id || null,
            paymentModel: sc.payment_model === 'recurring' ? 'monthly_recurring' : 'one_time',
            contractStartDate: sc.contract_start_date || '',
            contractEndDate: sc.contract_end_date || '',
            preferredDueDay: sc.preferred_due_day || 5,
            paymentTerms: sc.payment_terms || '',
            paymentNotes: sc.payment_notes || '',
            paymentDatesExcluded: sc.payment_dates_excluded || [],
          }))
        );
      }

      const { data: dbNegotiations } = await supabase.from('negotiations').select('*');
      if (dbNegotiations) {
        setNegotiationsState(
          dbNegotiations.map((n: any) => ({
            id: n.id,
            jobId: n.request_id,
            freelancerId: n.freelancer_id,
            negotiatedValue: Number(n.negotiated_value || 0),
            billingType: mapBillingTypeToUI(n.billing_type),
            scope: n.scope || '',
            status: mapNegotiationStatusToUI(n.status, n.is_above_policy),
            justificationIfAbovePolicy: n.exception_justification || undefined,
          }))
        );
      }

      const { data: dbAllocations } = await supabase.from('allocations').select('*');
      if (dbAllocations) {
        setAllocationsState(dbAllocations.map(mapAllocationToUI));
      }

      const { data: dbEvaluations } = await supabase.from('evaluations').select('*');
      if (dbEvaluations) {
        setEvaluationsState(dbEvaluations.map(mapEvaluationToUI));
      }

      const { data: dbPaymentCodes } = await supabase.from('payment_codes').select('*');
      if (dbPaymentCodes) {
        setPaymentCodesState(dbPaymentCodes.map(mapPaymentCodeToUI));
      }



      const { data: dbApprovals } = await supabase
        .from('allocation_approvals')
        .select('*');
      if (dbApprovals) {
        const mappedApprovals = dbApprovals.map(mapValueExceptionApprovalToUI);
        setApprovalsState(mappedApprovals as any[]);
        setValueExceptionApprovalsState(mappedApprovals);
      }

      const { data: dbReverse } = await supabase.from('reverse_evaluations').select('*');
      if (dbReverse) {
        setReverseEvaluationsState(
          dbReverse.map((re: any) => ({
            id: re.id,
            allocationId: re.allocation_id,
            jobId: re.job_id,
            requestId: re.request_id,
            freelancerId: re.freelancer_id,
            leaderId: re.leader_id,
            nucleoId: re.nucleo_id,
            client: re.client,
            briefingClarity: Number(re.briefing_clarity || 0),
            scopeAlignment: Number(re.scope_alignment || 0),
            directLeadership: Number(re.direct_leadership || 0),
            decisionSpeed: Number(re.decision_speed || 0),
            communication: Number(re.communication || 0),
            projectOrganization: Number(re.project_organization || 0),
            workingConditions: Number(re.working_conditions || 0),
            administrativeFlow: Number(re.administrative_flow || 0),
            npsProject: Number(re.nps_project || 0),
            csatProject: Number(re.csat_project || 0),
            cesOperational: Number(re.ces_operational || 0),
            observations: re.observations,
            projectExperienceScore: Number(re.project_experience_score || 0),
            leaderScoreComponent: Number(re.leader_score_component || 0),
            nucleusExperienceComponent: Number(re.nucleus_experience_component || 0),
            status: re.status,
            createdAt: re.created_at,
          }))
        );
      }

      const { data: dbSchedules } = await supabase.from('allocation_payment_schedules').select('*');
      if (dbSchedules) {
        setPaymentSchedulesState(dbSchedules.map(mapAllocationPaymentScheduleToUI));
      }

      const { data: dbPaymentRequests } = await supabase.from('payment_requests').select('*');
      if (dbPaymentRequests) {
        setPaymentRequestsState(dbPaymentRequests.map(mapPaymentRequestToUI));
      }

      const { data: dbFeeRules } = await supabase.from('job_success_fee_rules').select('*');
      if (dbFeeRules) {
        setJobSuccessFeeRules(dbFeeRules.map((r: any) => ({
          id: r.id,
          jobId: r.job_id,
          feeType: r.fee_type,
          fixedAmount: r.fixed_amount ? Number(r.fixed_amount) : undefined,
          percentageRate: r.percentage_rate ? Number(r.percentage_rate) : undefined,
          percentageBase: r.percentage_base || undefined,
          triggerType: r.trigger_type || undefined,
          terms: r.terms || undefined,
          requiresApproval: r.requires_approval ?? true,
          createdBy: r.created_by || undefined,
          version: r.version || undefined,
          isActive: r.is_active ?? true,
        })));
      }

      const { data: dbAllocFees } = await supabase.from('allocation_success_fees').select('*');
      if (dbAllocFees) {
        setAllocationSuccessFees(dbAllocFees.map((r: any) => {
          const alloc = dbAllocations?.find((a: any) => a.id === r.allocation_id);
          return {
            id: r.id,
            allocationId: r.allocation_id,
            jobId: alloc?.job_id || '',
            freelancerId: alloc?.freelancer_id || '',
            feeType: r.fee_type || 'fixed',
            fixedAmount: r.fixed_amount ? Number(r.fixed_amount) : undefined,
            percentageRate: r.percentage_rate ? Number(r.percentage_rate) : undefined,
            percentageBase: r.percentage_base || undefined,
            potentialAmount: r.calculated_potential_amount ? Number(r.calculated_potential_amount) : undefined,
            triggerType: r.trigger_type || undefined,
            termsSnapshot: r.terms || undefined,
            status: r.status === 'achieved' ? 'eligible' : r.status === 'failed' ? 'not_eligible' : r.status === 'paid' ? 'eligible' : 'pending_competition_result',
            eligibleAt: r.achieved_at || undefined,
            createdAt: r.created_at || undefined,
            updatedAt: r.updated_at || undefined
          };
        }));
      }
    } catch (error) {
      console.warn('Error loading data from Supabase:', error instanceof Error ? error.message : String(error));
    }
  };

  const safeSignOut = async (localOnly = false) => {
    try {
      if (localOnly) {
        await supabase.auth.signOut({ scope: 'local' });
      } else {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Standard signOut failed, falling back to local signOut:', err);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (localErr) {
        console.error('Local signOut failed:', localErr);
      }
    } finally {
      // Forcefully clear all local storage tokens to prevent infinite auth error loops
      if (typeof window !== 'undefined') {
        try {
          for (let i = window.localStorage.length - 1; i >= 0; i--) {
            const key = window.localStorage.key(i);
            if (key && (key.startsWith('sb-') || key.includes('supabase.auth.token'))) {
              window.localStorage.removeItem(key);
            }
          }
        } catch (e) {
          console.error('Manual localStorage clear failed:', e);
        }
      }
    }
  };

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) {
          // If it is a known refresh token not found/invalid error (due to rotation/expiration/revocation),
          // handle it silently to avoid flooding the console with AuthApiError warnings.
          if (!sessionErr.message.includes('Refresh Token Not Found') && !sessionErr.message.includes('invalid refresh token')) {
            console.warn('Restore Session Error:', sessionErr.message);
          }
          // If we fail to restore the session (e.g. invalid refresh token), we call signOut
          // to clear the invalid token from localStorage and prevent infinite console error loops.
          await safeSignOut(true);
          setIsLoggedIn(false);
          setCurrentUser(null);
          return;
        }
        if (session) {
          const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profileErr) {
            console.warn('Restore Session Profile Query Error:', `Stage: Restauração de Sessão - Consulta ao perfil (profiles), AuthUserId: ${session.user.id}, Message: ${profileErr.message}, Code: ${profileErr.code}, Details: ${profileErr.details}, Hint: ${profileErr.hint}`);
            await safeSignOut(false);
            setIsLoggedIn(false);
            setCurrentUser(null);
            return;
          }

          if (profile && profile.status === 'active') {
            const mappedUser = mapProfileToUser(profile);
            await loadDatabaseFromSupabase(mappedUser, session.access_token);
            setCurrentUser(mappedUser);
            setIsLoggedIn(true);
          } else {
            console.warn('Restore Session Profile not active or not found:', profile);
            await safeSignOut(false);
            setIsLoggedIn(false);
            setCurrentUser(null);
          }
        } else {
          setIsLoggedIn(false);
          setCurrentUser(null);
        }
      } catch (err) {
        console.warn('Unexpected error during session restoration:', err instanceof Error ? err.message : String(err));
        setIsLoggedIn(false);
        setCurrentUser(null);
      }
    };
    restoreSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setIsLoggedIn(false);
        setCurrentUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);



  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!emailInput.trim() || !passwordInput) {
      setLoginError('Por favor, preencha o e-mail e a senha de segurança.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const emailQuery = emailInput.trim().toLowerCase();
      
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: emailQuery,
        password: passwordInput,
      });

      if (authErr) {
        console.warn('Login Step Error:', `Stage: Autenticação (signInWithPassword), Message: ${authErr.message}, Status: ${authErr.status}`);

        if (authErr.message.includes('Invalid login credentials')) {
          setLoginError('E-mail ou senha inválidos.');
        } else {
          setLoginError('Não foi possível carregar seu perfil. Tente novamente ou contate o administrador.');
        }
        setIsLoggingIn(false);
        return;
      }

      const session = authData.session;
      if (!session) {
        setLoginError('Falha ao autenticar.');
        setIsLoggingIn(false);
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profileErr) {
        console.warn('Login Step Error:', `Stage: Consulta ao perfil (profiles), AuthUserId: ${session.user.id}, Message: ${profileErr.message}, Code: ${profileErr.code}, Details: ${profileErr.details}, Hint: ${profileErr.hint}`);
        setLoginError('Não foi possível carregar seu perfil. Tente novamente ou contate o administrador.');
        await safeSignOut(false);
        setIsLoggingIn(false);
        return;
      }

      if (!profile) {
        console.warn('Login Step Warning: Profile not found for authenticated user', session.user.id);
        setLoginError('Perfil não encontrado.');
        await safeSignOut(false);
        setIsLoggingIn(false);
        return;
      }

      if (profile.status === 'inactive') {
        setLoginError('Sua conta está inativa. Entre em contato com o Master/RH.');
        await safeSignOut(false);
        setIsLoggingIn(false);
        return;
      }

      await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', session.user.id);

      const mappedUser = mapProfileToUser({
        ...profile,
        last_login_at: new Date().toISOString(),
      });

      await loadDatabaseFromSupabase(mappedUser, session.access_token);

      setCurrentUser(mappedUser);
      setIsLoggedIn(true);
      setActiveTab('Dashboard');
    } catch (err: any) {
      setLoginError(err.message || 'Erro inesperado.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCompulsoryPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompulsoryError(null);

    if (!currentUser) return;

    if (!compulsoryCurrentPassword || !compulsoryNewPassword || !compulsoryConfirmPassword) {
      setCompulsoryError('Todos os campos de senha são obrigatórios.');
      return;
    }

    if (compulsoryNewPassword !== compulsoryConfirmPassword) {
      setCompulsoryError('As senhas novas informadas não coincidem.');
      return;
    }

    setIsCompulsorySubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      if (!token) {
        setCompulsoryError('Sessão expirada. Faça login novamente.');
        handleLogOut();
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: compulsoryCurrentPassword,
      });

      if (signInErr) {
        setCompulsoryError('A senha atual está incorreta.');
        return;
      }

      const res = await updateOwnPasswordAction(token, compulsoryNewPassword);
      if (!res.success) {
        setCompulsoryError(res.error || 'Falha ao atualizar senha.');
        return;
      }

      const upgradedUser = {
        ...currentUser,
        firstAccessPending: false
      };

      setCurrentUser(upgradedUser);
      setCompulsoryCurrentPassword('');
      setCompulsoryNewPassword('');
      setCompulsoryConfirmPassword('');
      
      setUsersState(prev => prev.map(u => u.id === currentUser.id ? { ...u, firstAccessPending: false } : u));
      
      setActiveTab('Dashboard');
    } catch (err: any) {
      setCompulsoryError(err.message || 'Erro inesperado.');
    } finally {
      setIsCompulsorySubmitting(false);
    }
  };

  const handleLogOut = async () => {
    await safeSignOut(false);
    setIsLoggedIn(false);
    setCurrentUser(null);
    setRealMasterUser(null);
    setSimulatedProfile(null);
    setIsRoleSwitcherOpen(false);
    setEmailInput('');
    setPasswordInput('');
    setLoginError(null);
    setIsHeaderMenuOpen(false);
  };

  const isUuid = (id: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  };

  // State wrappers to intercept local mutations and sync to Supabase in the background
  const wrapStateSetter = <T extends { id: string }>(
    currentState: T[],
    setLocalState: React.Dispatch<React.SetStateAction<T[]>>,
    onInsert: (item: T) => Promise<any>,
    onUpdate: (item: T, original: T) => Promise<any>,
    onDelete?: (item: T) => Promise<any>
  ) => {
    return (updateArg: React.SetStateAction<T[]>) => {
      const nextState = typeof updateArg === 'function' 
        ? (updateArg as Function)(currentState) 
        : updateArg;

      const currentMap = new Map<string, T>(currentState.map((x: any) => [x.id, x]));
      const nextMap = new Map<string, T>(nextState.map((x: any) => [x.id, x]));

      // 1. Sync inserts
      for (const item of nextState) {
        if (!currentMap.has(item.id)) {
          if (!isUuid(item.id)) {
            onInsert(item).catch(err => console.error('Failed to sync insert:', err));
          }
        }
      }

      // 2. Sync updates
      for (const item of nextState) {
        const original = currentMap.get(item.id);
        if (original && JSON.stringify(original) !== JSON.stringify(item)) {
          if (isUuid(item.id)) {
            onUpdate(item, original).catch(err => console.error('Failed to sync update:', err));
          }
        }
      }

      // 3. Sync deletes
      if (onDelete) {
        for (const item of currentState) {
          if (!nextMap.has(item.id)) {
            if (isUuid(item.id)) {
              onDelete(item).catch(err => console.error('Failed to sync delete:', err));
            }
          }
        }
      }

      setLocalState(nextState);
    };
  };

  // DB Sync Handlers for each model
  const handleFreelancerInsert = async (f: Freelancer) => {
    if (isUuid(f.id)) return;
    const funcId = await getFunctionIdByName(f.mainRole);
    const { data: created, error } = await supabase
      .from('freelancers')
      .insert({
        full_name: f.name,
        email: f.email,
        whatsapp: f.whatsapp,
        city: f.city,
        state: f.state,
        main_function_id: funcId,
        seniority: mapSeniorityToDB(f.seniority),
        portfolio_url: f.portfolioUrl,
        status: mapFreelancerStatusToDB(f.status),
        availability: mapAvailabilityToDB(f.availability),
        reference_daily_rate: f.referenceValue,
        observations: f.observations,
        cnpj_normalized: f.cnpj_normalized || null,
        foreign_tax_id: f.foreign_tax_id || null,
        tax_country_code: f.tax_country_code || 'BR',
        cnpj_source: f.cnpj_source || 'manual_rh',
        cnpj_is_mock: f.cnpj_is_mock || false,
      })
      .select('id')
      .single();

    if (error) throw error;

    if (created) {
      if (f.industries && f.industries.length > 0) {
        for (const indName of f.industries) {
          const indId = await getIndustryIdByName(indName);
          if (indId) {
            await supabase
              .from('freelancer_industries')
              .insert({ freelancer_id: created.id, industry_id: indId });
          }
        }
      }
      if (f.id !== created.id) {
        setFreelancersState(prev => prev.map(item => item.id === f.id ? { ...item, id: created.id } : item));
      }
    }
  };

  const handleFreelancerUpdate = async (f: Freelancer, original: Freelancer) => {
    const funcId = await getFunctionIdByName(f.mainRole);
    const { error } = await supabase
      .from('freelancers')
      .update({
        full_name: f.name,
        email: f.email,
        whatsapp: f.whatsapp,
        city: f.city,
        state: f.state,
        main_function_id: funcId,
        seniority: mapSeniorityToDB(f.seniority),
        portfolio_url: f.portfolioUrl || null,
        status: mapFreelancerStatusToDB(f.status),
        availability: mapAvailabilityToDB(f.availability),
        reference_daily_rate: f.referenceValue,
        average_score: f.averageScore,
        observations: f.observations,
        // Sync extended fields to DB
        location_text: f.locationText || null,
        planner_score: f.plannerScore !== undefined && f.plannerScore !== null ? f.plannerScore : null,
        powerpoint_score: f.powerpointScore !== undefined && f.powerpointScore !== null ? f.powerpointScore : null,
        has_worked_with_v3a: f.hasWorkedWithV3a || null,
        v3a_projects: f.v3aProjects || null,
        current_situation: f.currentSituation || null,
        contract_type: f.contractType || null,
        brands_worked: f.brandsWorked || null,
        // Social & portfolio
        linkedin_url: f.linkedinUrl || null,
        instagram_url: f.instagramUrl || null,
        portfolio_file_url: f.portfolioFileUrl || null,
        portfolio_file_path: f.portfolioFilePath || null,
        portfolio_file_name: f.portfolioFileName || null,
        cnpj_normalized: f.cnpj_normalized || null,
        foreign_tax_id: f.foreign_tax_id || null,
        tax_country_code: f.tax_country_code || 'BR',
        cnpj_source: f.cnpj_source || null,
        cnpj_is_mock: f.cnpj_is_mock || false,
      })
      .eq('id', f.id);

    if (error) throw error;
  };

  const handleJobInsert = async (j: Job) => {
    if (isUuid(j.id)) return;
    const urgencyDb = mapUrgencyToDB(j.urgency);
    const statusDb = mapJobStatusToDB(j.status);
    
    const { data: parentJob, error: jobErr } = await supabase
      .from('jobs')
      .insert({
        job_code: `JOB-${Date.now().toString().slice(-6)}`,
        title: j.name,
        client_name: j.client,
        nucleo_id: j.nucleoId,
        requester_id: j.requesterId || currentUser?.id,
        description: j.description,
        urgency: urgencyDb,
        status: statusDb,
      })
      .select('id')
      .single();

    if (jobErr) throw jobErr;

    const funcId = await getFunctionIdByName(j.roleNeeded);
    const { data: requestJob, error: reqErr } = await supabase
      .from('job_freelancer_requests')
      .insert({
        request_code: `REQ-${Date.now().toString().slice(-6)}`,
        job_id: parentJob.id,
        function_id: funcId,
        seniority: mapSeniorityToDB(j.seniorityNeeded),
        scope_description: j.description,
        deliverables: j.deliverables,
        start_date: j.startDate,
        end_date: j.endDate,
        budget_max: j.budget,
        status: statusDb,
      })
      .select('id')
      .single();

    if (reqErr) {
      await supabase.from('jobs').delete().eq('id', parentJob.id);
      throw reqErr;
    }

    if (requestJob && j.id !== requestJob.id) {
      setJobsState(prev => prev.map(item => item.id === j.id ? { ...item, id: requestJob.id } : item));
      if (selectedJobId === j.id) {
        setSelectedJobId(requestJob.id);
      }
    }
  };

  const handleJobUpdate = async (j: Job, original: Job) => {
    const statusDb = mapJobStatusToDB(j.status);
    const urgencyDb = mapUrgencyToDB(j.urgency);

    const { data: reqData } = await supabase
      .from('job_freelancer_requests')
      .select('job_id')
      .eq('id', j.id)
      .single();

    if (reqData) {
      await supabase
        .from('jobs')
        .update({
          title: j.name,
          client_name: j.client,
          description: j.description,
          urgency: urgencyDb,
          status: statusDb,
        })
        .eq('id', reqData.job_id);

      const funcId = await getFunctionIdByName(j.roleNeeded);
      await supabase
        .from('job_freelancer_requests')
        .update({
          function_id: funcId,
          seniority: mapSeniorityToDB(j.seniorityNeeded),
          scope_description: j.description,
          deliverables: j.deliverables,
          start_date: j.startDate,
          end_date: j.endDate,
          budget_max: j.budget,
          status: statusDb,
          selected_freelancer_id: j.selectedFreelancerId,
          closed_at: j.closedAt,
          closed_by: j.closedBy,
          closure_reason: j.closureReason,
        })
        .eq('id', j.id);
    }
  };

  const handleShortlistInsert = async (s: Shortlist) => {
    if (isUuid(s.id) || !isUuid(s.jobId) || !isUuid(s.freelancerId)) return;
    const { data: reqData } = await supabase
      .from('job_freelancer_requests')
      .select('job_id')
      .eq('id', s.jobId)
      .single();

    if (reqData) {
      const { data: created, error } = await supabase
        .from('shortlist_candidates')
        .insert({
          job_id: reqData.job_id,
          request_id: s.jobId,
          freelancer_id: s.freelancerId,
          candidate_status: mapCandidateStatusToDBEnum(s.negotiationStatus || s.candidateStatus),
          notes: s.notes || null,
          negotiation_status: mapCandidateStatusToDB(s.negotiationStatus || s.candidateStatus),
          negotiated_rate: s.negotiatedRate || null,
          remuneration_model: mapBillingTypeToDB(s.remunerationModel || 'Diária'),
          policy_status: s.policyStatus || 'pending_check',
          schedule_conflict: s.scheduleConflict || false,
          requires_rh_approval: s.requiresRhApproval || false,
          requires_head_approval: s.requiresHeadApproval || false,
          selected_for_allocation: s.selectedForAllocation || false,
          source_bucket: s.sourceBucket || 'manual',
          match_score: s.matchScore || null,
          recommendation_reasons: s.recommendationReasons || null,
          shortlist_position: s.shortlistPosition || null,
          negotiated_total: s.negotiatedTotal || null,
          budget_saving_amount: s.budgetSavingAmount || null,
          budget_saving_percentage: s.budgetSavingPercentage || null,
          daily_budget_reference: s.dailyBudgetReference || null,
          daily_saving_amount: s.dailySavingAmount || null,
          budget_delta_status: s.budgetDeltaStatus || 'not_calculated',
          estimated_hours: s.estimatedHours || null,
          schedule_approval_id: s.scheduleApprovalId || null,
          value_approval_id: s.valueApprovalId || null,
          payment_model: s.paymentModel === 'monthly_recurring' ? 'recurring' : 'single',
          contract_start_date: s.contractStartDate || null,
          contract_end_date: s.contractEndDate || null,
          preferred_due_day: s.preferredDueDay || null,
          payment_terms: s.paymentTerms || null,
          payment_notes: s.paymentNotes || null,
          payment_dates_excluded: s.paymentDatesExcluded || [],
        })
        .select('id')
        .single();

      if (error) throw error;

      if (created && s.id !== created.id) {
        setShortlistsState(prev => prev.map(item => item.id === s.id ? { ...item, id: created.id } : item));
      }
    }
  };

  const handleShortlistUpdate = async (s: Shortlist, original: Shortlist) => {
    if (!isUuid(s.id)) return;
    await supabase
      .from('shortlist_candidates')
      .update({
        candidate_status: mapCandidateStatusToDBEnum(s.negotiationStatus || s.candidateStatus),
        notes: s.notes || null,
        negotiation_status: mapCandidateStatusToDB(s.negotiationStatus || s.candidateStatus),
        negotiated_rate: s.negotiatedRate || null,
        remuneration_model: mapBillingTypeToDB(s.remunerationModel || 'Diária'),
        policy_status: s.policyStatus || 'pending_check',
        schedule_conflict: s.scheduleConflict || false,
        requires_rh_approval: s.requiresRhApproval || false,
        requires_head_approval: s.requiresHeadApproval || false,
        selected_for_allocation: s.selectedForAllocation || false,
        source_bucket: s.sourceBucket || 'manual',
        match_score: s.matchScore || null,
        recommendation_reasons: s.recommendationReasons || null,
        shortlist_position: s.shortlistPosition || null,
        negotiated_total: s.negotiatedTotal || null,
        budget_saving_amount: s.budgetSavingAmount || null,
        budget_saving_percentage: s.budgetSavingPercentage || null,
        daily_budget_reference: s.dailyBudgetReference || null,
        daily_saving_amount: s.dailySavingAmount || null,
        budget_delta_status: s.budgetDeltaStatus || 'not_calculated',
        estimated_hours: s.estimatedHours || null,
        schedule_approval_id: s.scheduleApprovalId || null,
        value_approval_id: s.valueApprovalId || null,
        payment_model: s.paymentModel === 'monthly_recurring' ? 'recurring' : 'single',
        contract_start_date: s.contractStartDate || null,
        contract_end_date: s.contractEndDate || null,
        preferred_due_day: s.preferredDueDay || null,
        payment_terms: s.paymentTerms || null,
        payment_notes: s.paymentNotes || null,
        payment_dates_excluded: s.paymentDatesExcluded || [],
      })
      .eq('id', s.id);
  };

  const handleShortlistDelete = async (s: Shortlist) => {
    if (!isUuid(s.id)) return;
    await supabase
      .from('shortlist_candidates')
      .delete()
      .eq('id', s.id);
  };

  const handleNegotiationInsert = async (n: Negotiation) => {
    if (isUuid(n.id)) return;
    const { data: reqData } = await supabase
      .from('job_freelancer_requests')
      .select('job_id, is_above_policy')
      .eq('id', n.jobId)
      .single();

    if (reqData) {
      const isAbovePolicy = reqData.is_above_policy || false;
      const statusDb = n.status === 'Aprovado pelo RH' ? 'aprovado_rh' : n.status === 'Rejeitado pelo RH' ? 'rejeitado' : 'em_negociacao';
      
      const { data: created, error } = await supabase
        .from('negotiations')
        .insert({
          job_id: reqData.job_id,
          request_id: n.jobId,
          freelancer_id: n.freelancerId,
          scope: n.scope,
          negotiated_value: n.negotiatedValue,
          billing_type: mapBillingTypeToDB(n.billingType),
          is_above_policy: isAbovePolicy,
          exception_justification: n.justificationIfAbovePolicy || null,
          status: statusDb,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (created && n.id !== created.id) {
        setNegotiationsState(prev => prev.map(item => item.id === n.id ? { ...item, id: created.id } : item));
      }
    }
  };

  const handleNegotiationUpdate = async (n: Negotiation, original: Negotiation) => {
    const statusDb = n.status === 'Aprovado pelo RH' ? 'aprovado_rh' : n.status === 'Rejeitado pelo RH' ? 'rejeitado' : 'em_negociacao';
    await supabase
      .from('negotiations')
      .update({
        scope: n.scope,
        negotiated_value: n.negotiatedValue,
        billing_type: mapBillingTypeToDB(n.billingType),
        exception_justification: n.justificationIfAbovePolicy || null,
        status: statusDb,
      })
      .eq('id', n.id);
  };

  const handleNegotiationDelete = async (n: Negotiation) => {
    await supabase
      .from('negotiations')
      .delete()
      .eq('id', n.id);
  };

  const handleAllocationInsert = async (a: Allocation) => {
    if (isUuid(a.id) || !isUuid(a.jobId) || !isUuid(a.freelancerId)) return;
    const { data: reqData } = await supabase
      .from('job_freelancer_requests')
      .select('job_id, jobs(nucleo_id)')
      .eq('id', a.jobId)
      .single();

    if (reqData) {
      const parentJobId = reqData.job_id;
      const nId = (reqData.jobs as any)?.nucleo_id || a.nucleoId;

      const { data: created, error } = await supabase
        .from('allocations')
        .insert({
          job_id: parentJobId,
          request_id: a.jobId,
          freelancer_id: a.freelancerId,
          nucleo_id: nId,
          start_date: a.startDate,
          end_date: a.endDate,
          approved_value: a.approvedValue,
          status: mapAllocationStatusToDB(a.status),
          negotiated_total: a.negotiatedTotal || null,
          budget_saving_amount: a.budgetSavingAmount || null,
          budget_saving_percentage: a.budgetSavingPercentage || null,
          daily_budget_reference: a.dailyBudgetReference || null,
          daily_saving_amount: a.dailySavingAmount || null,
          budget_delta_status: a.budgetDeltaStatus || 'not_calculated',
          estimated_hours: a.estimatedHours || null,
        })
        .select('id, allocation_code')
        .single();

      if (error) throw error;

      if (created && a.id !== created.id) {
        setAllocationsState(prev => prev.map(item => item.id === a.id ? { 
          ...item, 
          id: created.id, 
          allocationCode: created.allocation_code 
        } : item));
      }
    }
  };

  const handleAllocationUpdate = async (a: Allocation, original: Allocation) => {
    if (!isUuid(a.id)) return;
    await supabase
      .from('allocations')
      .update({
        start_date: a.startDate,
        end_date: a.endDate,
        approved_value: a.approvedValue,
        status: mapAllocationStatusToDB(a.status),
        negotiated_total: a.negotiatedTotal || null,
        budget_saving_amount: a.budgetSavingAmount || null,
        budget_saving_percentage: a.budgetSavingPercentage || null,
        daily_budget_reference: a.dailyBudgetReference || null,
        daily_saving_amount: a.dailySavingAmount || null,
        budget_delta_status: a.budgetDeltaStatus || 'not_calculated',
        estimated_hours: a.estimatedHours || null,
      })
      .eq('id', a.id);
  };

  const handleAllocationDelete = async (a: Allocation) => {
    if (!isUuid(a.id)) return;
    await supabase
      .from('allocations')
      .delete()
      .eq('id', a.id);
  };

  const handleEvaluationInsert = async (e: Evaluation) => {
    if (isUuid(e.id)) return;
    const { data: reqData } = await supabase
      .from('job_freelancer_requests')
      .select('job_id, jobs(nucleo_id)')
      .eq('id', e.jobId)
      .single();

    if (reqData) {
      const parentJobId = reqData.job_id;
      const nId = (reqData.jobs as any)?.nucleo_id || '55d9d7c0-d3cb-4f1e-84ad-e77ff961805b';
      const recommendationDb = e.recommendation === 'Sim' ? 'sim' : e.recommendation === 'Sim, com restrição' ? 'sim_com_restricao' : 'nao';

      const { data: created, error } = await supabase
        .from('evaluations')
        .insert({
          job_id: parentJobId,
          request_id: e.jobId,
          freelancer_id: e.freelancerId,
          nucleo_id: nId,
          evaluator_id: currentUser?.id || e.evaluatorId,
          technical_quality: e.technicalQuality,
          deadline: e.deadline,
          briefing_adherence: e.briefingAdherence,
          communication: e.communication,
          autonomy: e.autonomy,
          behavior: e.behavior,
          comment: e.comment,
          recommendation: recommendationDb,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (created && e.id !== created.id) {
        setEvaluationsState(prev => prev.map(item => item.id === e.id ? { ...item, id: created.id } : item));
      }
    }
  };

  const handleEvaluationUpdate = async (e: Evaluation, original: Evaluation) => {
    const recommendationDb = e.recommendation === 'Sim' ? 'sim' : e.recommendation === 'Sim, com restrição' ? 'sim_com_restricao' : 'nao';
    await supabase
      .from('evaluations')
      .update({
        technical_quality: e.technicalQuality,
        deadline: e.deadline,
        briefing_adherence: e.briefingAdherence,
        communication: e.communication,
        autonomy: e.autonomy,
        behavior: e.behavior,
        comment: e.comment,
        recommendation: recommendationDb,
      })
      .eq('id', e.id);
  };

  const handleEvaluationDelete = async (e: Evaluation) => {
    await supabase
      .from('evaluations')
      .delete()
      .eq('id', e.id);
  };

  const handlePaymentCodeUpdate = async (p: PaymentCode, original: PaymentCode) => {
    let statusDb = 'aguardando_conclusao';
    switch (p.paymentStatus) {
      case 'Liberado para pagamento': statusDb = 'liberado_para_pagamento'; break;
      case 'Bloqueado': statusDb = 'bloqueado'; break;
      case 'Encerrado': statusDb = 'encerrado'; break;
      case 'Aguardando conclusão do job': statusDb = 'aguardando_conclusao'; break;
      case 'Aguardando avaliação': statusDb = 'aguardando_avaliacao'; break;
    }
    await supabase
      .from('payment_codes')
      .update({ payment_status: statusDb })
      .eq('id', p.id);
  };



  const handleNucleoInsert = async (n: Nucleo) => {
    if (isUuid(n.id)) return;

    const { data: created, error } = await supabase
      .from('nucleos')
      .insert({
        name: n.name,
        head_name: n.headName,
        head_email: n.headEmail,
        status: n.status === 'Ativo' ? 'active' : 'inactive',
      })
      .select('id')
      .single();

    if (error) throw error;

    if (created && n.id !== created.id) {
      setNucleosState(prev => prev.map(item => item.id === n.id ? { ...item, id: created.id } : item));
    }
  };

  const handleNucleoUpdate = async (n: Nucleo, original: Nucleo) => {
    await supabase
      .from('nucleos')
      .update({
        name: n.name,
        head_name: n.headName,
        head_email: n.headEmail,
        status: n.status === 'Ativo' ? 'active' : 'inactive',
        head_user_id: n.headUserId || null,
        archived_at: n.archivedAt || null,
        archived_by: n.archivedBy || null,
        archive_reason: n.archiveReason || null,
      })
      .eq('id', n.id);
  };

  const handlePolicyInsert = async (p: ValuePolicy) => {
    if (isUuid(p.id)) return;
    const funcId = await getFunctionIdByName(p.role);
    const getRemunerationModel = (bt: string) => {
      switch (bt) {
        case 'Diária': return 'daily';
        case 'Hora': return 'hourly';
        case 'Job Fechado': return 'fixed_job';
        case 'Mensal / Salário': return 'monthly_salary';
        default: return 'daily';
      }
    };
    const { data: created, error } = await supabase
      .from('rate_policies')
      .insert({
        function_id: funcId,
        seniority: mapSeniorityToDB(p.seniority),
        billing_type: mapBillingTypeToDB(p.billingType),
        reference_value: p.referenceValue,
        ceiling_value: p.ceilingValue,
        remuneration_model: getRemunerationModel(p.billingType),
        approval_required_above: p.ceilingValue,
        status: p.status === 'Inativo' ? 'inactive' : 'active',
        notes: p.notes || null,
        success_fee_max_percent: p.successFeeMaxPercent !== undefined ? p.successFeeMaxPercent : null,
      })
      .select('id')
      .single();

    if (error) throw error;

    if (created && p.id !== created.id) {
      setPoliciesState(prev => prev.map(item => item.id === p.id ? { ...item, id: created.id } : item));
    }
  };

  const handlePolicyUpdate = async (p: ValuePolicy, original: ValuePolicy) => {
    const funcId = await getFunctionIdByName(p.role);
    const getRemunerationModel = (bt: string) => {
      switch (bt) {
        case 'Diária': return 'daily';
        case 'Hora': return 'hourly';
        case 'Job Fechado': return 'fixed_job';
        case 'Mensal / Salário': return 'monthly_salary';
        default: return 'daily';
      }
    };
    await supabase
      .from('rate_policies')
      .update({
        function_id: funcId,
        seniority: mapSeniorityToDB(p.seniority),
        billing_type: mapBillingTypeToDB(p.billingType),
        reference_value: p.referenceValue,
        ceiling_value: p.ceilingValue,
        remuneration_model: getRemunerationModel(p.billingType),
        approval_required_above: p.ceilingValue,
        status: p.status === 'Inativo' ? 'inactive' : 'active',
        notes: p.notes || null,
        success_fee_max_percent: p.successFeeMaxPercent !== undefined ? p.successFeeMaxPercent : null,
      })
      .eq('id', p.id);
  };

  const handleUserInsert = async (u: User) => {
    if (isUuid(u.id)) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (token) {
      const res = await createUserAction(token, {
        full_name: u.name,
        email: u.email,
        role: (
          (u.profile as string) === 'NÚCLEO' || (u.profile as string) === 'NUCLEO' ? 'nucleo' :
          u.profile === 'C-LEVEL' ? 'c_level' :
          u.profile === 'OPERAÇÕES' || u.profile === 'OPERAÇÃO' ? 'operations' :
          u.profile.toLowerCase()
        ) as any,
        nucleo_id: u.nucleoId || null,
        job_title: u.role,
        password: u.password,
      });
      if (res.success) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', u.email)
          .single();
        
        if (profile) {
          setUsersState(prev => prev.map(item => item.email === u.email ? { ...item, id: profile.id } : item));
        }
      } else {
        alert(`Erro ao criar usuário no Supabase: ${res.error}`);
        setUsersState(prev => prev.filter(item => item.id !== u.id));
      }
    }
  };

  const handleUserUpdate = async (u: User, original: User) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (u.password !== original.password && token) {
      const res = await resetUserPasswordAction(token, u.id, u.password);
      if (!res.success) {
        alert(`Erro ao redefinir senha no Supabase: ${res.error}`);
        return;
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: u.name,
        email: u.email,
        job_title: u.role,
        role: ((u.profile as string) === 'NÚCLEO' || (u.profile as string) === 'NUCLEO' ? 'nucleo' : (u.profile === 'C-LEVEL' ? 'c_level' : u.profile.toLowerCase())) as any,
        nucleo_id: u.nucleoId || null,
        status: u.status === 'Ativo' ? 'active' : 'inactive',
        first_login_required: u.firstAccessPending,
      })
      .eq('id', u.id);

    if (error) {
      alert(`Erro ao atualizar perfil no Supabase: ${error.message}`);
    }
  };

  const reloadDatabase = async () => {
    if (currentUser) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await loadDatabaseFromSupabase(currentUser, session.access_token);
      }
    }
  };

  // State bundle pack for UI
  const db: DatabaseProps = {
    freelancers: freelancersState,
    setFreelancers: wrapStateSetter(freelancersState, setFreelancersState, handleFreelancerInsert, handleFreelancerUpdate),
    setFreelancersState,
    jobs: jobsState,
    setJobs: wrapStateSetter(jobsState, setJobsState, handleJobInsert, handleJobUpdate),
    shortlists: shortlistsState,
    setShortlists: wrapStateSetter(shortlistsState, setShortlistsState, handleShortlistInsert, handleShortlistUpdate, handleShortlistDelete),
    negotiations: negotiationsState,
    setNegotiations: wrapStateSetter(negotiationsState, setNegotiationsState, handleNegotiationInsert, handleNegotiationUpdate, handleNegotiationDelete),
    policies: policiesState,
    setPolicies: wrapStateSetter(policiesState, setPoliciesState, handlePolicyInsert, handlePolicyUpdate),
    allocations: allocationsState,
    setAllocations: wrapStateSetter(allocationsState, setAllocationsState, handleAllocationInsert, handleAllocationUpdate, handleAllocationDelete),
    evaluations: evaluationsState,
    setEvaluations: wrapStateSetter(evaluationsState, setEvaluationsState, handleEvaluationInsert, handleEvaluationUpdate, handleEvaluationDelete),
    paymentCodes: paymentCodesState,
    setPaymentCodes: wrapStateSetter(paymentCodesState, setPaymentCodesState, async () => {}, handlePaymentCodeUpdate),

    nucleos: nucleosState,
    setNucleos: wrapStateSetter(nucleosState, setNucleosState, handleNucleoInsert, handleNucleoUpdate),
    approvals: approvalsState,
    setApprovals: setApprovalsState,
    valueExceptionApprovals: valueExceptionApprovalsState,
    setValueExceptionApprovals: setValueExceptionApprovalsState,
    reverseEvaluations: reverseEvaluationsState,
    setReverseEvaluations: setReverseEvaluationsState,
    paymentSchedules: paymentSchedulesState,
    setPaymentSchedules: setPaymentSchedulesState,
    paymentRequests: paymentRequestsState,
    setPaymentRequests: setPaymentRequestsState,
    jobSuccessFeeRules,
    setJobSuccessFeeRules,
    allocationSuccessFees,
    setAllocationSuccessFees,
    reloadDatabase,
    activeTab,
    setActiveTab,
    selectedFreelancerId,
    setSelectedFreelancerId,
    selectedJobId,
    setSelectedJobId,
    currentUser: currentUser ? {
      ...currentUser,
      isMasterAccount,
      isSimulated: !!simulatedProfile
    } as User : null as any,
    setCurrentUser,
    users: usersState,
    setUsers: wrapStateSetter(usersState, setUsersState, handleUserInsert, handleUserUpdate)
  };

  // Sidebar navigation menu options, filtered precisely by Role profile spec.
  const getSidebarNavigationItems = () => {
    if (!currentUser) return [];

    switch (getRoleLabel(currentUser.profile)) {
      case 'MASTER':
        return [
          { name: 'Dashboard Geral', icon: LayoutDashboard },
          { name: 'Cadastro de Núcleos', icon: Building },
          { name: 'Gestão de Usuários', icon: UserCog },
          { name: 'Banco de Freelancers', icon: Contact },
          { name: 'Links Públicos / QR Codes', icon: QrCode },
          { name: 'Análise de Pré-cadastros', icon: FileCheck2 },
          { name: 'Criar Oportunidade', icon: FolderPlus },
          { name: 'Shortlist & Negociação', icon: Handshake },
          { name: 'Política de Valores', icon: Scale },
          { name: 'Meus Bookings', icon: CalendarCheck },
          { name: 'Timeline de Alocações', icon: CalendarRange },
          { name: 'Base 3D / Cenografia', icon: Box },
          { name: 'Relatórios & Exportar', icon: TrendingUp },
          { name: 'Configurações', icon: SlidersHorizontal }
        ];
      case 'RH':
        return [
          { name: 'Dashboard RH', icon: LayoutDashboard },
          { name: 'Cadastro de Núcleos', icon: Building },
          { name: 'Gestão de Usuários dos Núcleos', icon: UserCog },
          { name: 'Banco de Freelancers', icon: Contact },
          { name: 'Links Públicos / QR Codes', icon: QrCode },
          { name: 'Análise de Pré-cadastros', icon: FileCheck2 },
          { name: 'Shortlist & Negociação', icon: Handshake },
          { name: 'Política de Valores', icon: Scale },
          { name: 'Meus Bookings', icon: CalendarCheck },
          { name: 'Timeline de Alocações', icon: CalendarRange },
          { name: 'Relatórios', icon: TrendingUp }
        ];
      case 'C-LEVEL':
        return [
          { name: 'Dashboard C-LEVEL', icon: LayoutDashboard },
          { name: 'Cadastro de Núcleos', icon: Building },
          { name: 'Banco de Freelancers', icon: Contact },
          { name: 'Links Públicos / QR Codes', icon: QrCode },
          { name: 'Criar Oportunidade', icon: FolderPlus },
          { name: 'Shortlist & Negociação', icon: Handshake },
          { name: 'Meus Bookings', icon: CalendarCheck },
          { name: 'Timeline de Alocações', icon: CalendarRange },
          { name: 'Base 3D / Cenografia', icon: Box },
          { name: 'Relatórios', icon: TrendingUp },
          { name: 'Configurações', icon: SlidersHorizontal }
        ];
      case 'OPERAÇÕES':
      case 'OPERAÇÃO':
        return [
          { name: 'Dashboard Operações', icon: LayoutDashboard },
          { name: 'Cadastro de Núcleos', icon: Building },
          { name: 'Banco de Freelancers', icon: Contact },
          { name: 'Links Públicos / QR Codes', icon: QrCode },
          { name: 'Criar Oportunidade', icon: FolderPlus },
          { name: 'Shortlist & Negociação', icon: Handshake },
          { name: 'Meus Bookings / Alocações', icon: CalendarCheck },
          { name: 'Timeline de Alocações', icon: CalendarRange },
          { name: 'Base 3D / Cenografia', icon: Box },
          { name: 'Relatórios & Exportar', icon: TrendingUp }
        ];
      case 'NÚCLEO':
        return [
          { name: 'Meu Núcleo', icon: LayoutDashboard },
          { name: 'Buscar Freelancers', icon: Contact },
          { name: 'Links Públicos / QR Codes', icon: QrCode },
          { name: 'Criar Oportunidade', icon: FolderPlus },
          { name: 'Shortlist & Negociação', icon: Handshake },
          { name: 'Meus Bookings', icon: CalendarCheck },
          { name: 'Timeline de Alocações', icon: CalendarRange },
          { name: 'Base 3D / Cenografia', icon: Box },
          { name: 'Avaliar Freela', icon: Award }
        ];
      default:
        return [
          { name: 'Dashboard Geral', icon: LayoutDashboard }
        ];
    }
  };

  const navItems = getSidebarNavigationItems();

  // Helper mapping function to handle correct activeTab routing cleanly
  const handleMenuClick = (menuName: string) => {
    if (menuName === 'Dashboard Geral' || menuName === 'Dashboard RH' || menuName === 'Dashboard C-LEVEL' || menuName === 'Meu Núcleo' || menuName === 'Dashboard Operações') {
      setActiveTab('Dashboard');
    } else if (menuName === 'Meus Bookings' || menuName === 'Concluir Job' || menuName === 'Meus Bookings / Alocações') {
      setActiveTab('Meus Bookings');
    } else if (menuName === 'Buscar Freelancers' || menuName === 'Banco de Freelancers') {
      setActiveTab('Banco de Freelancers');
    } else if (menuName === 'Shortlist & Negociação') {
      setSelectedJobId(null);
      setActiveTab('Shortlist');
    } else if (menuName === 'Sugestões de Freelas') {
      setActiveTab('Sugestões de Freelas');
    } else if (menuName === 'Sugerir Novo Freela') {
      setActiveTab('Sugerir Freelancer');
    } else if (menuName === 'Avaliar Freela') {
      setActiveTab('Avaliar Freelancers');
    } else if (menuName === 'Relatórios & Exportar' || menuName === 'Relatórios') {
      setActiveTab('Relatórios & Exportar');
    } else if (menuName === 'Gestão de Usuários' || menuName === 'Gestão de Usuários dos Núcleos') {
      setActiveTab('Gestão de Usuários');
    } else if (menuName === 'Configurações') {
      setActiveTab('Meu Perfil');
    } else {
      setActiveTab(menuName);
    }
  };

  const isMenuSelected = (menuName: string) => {
    if (activeTab === 'Dashboard') {
      return menuName === 'Dashboard Geral' || menuName === 'Dashboard RH' || menuName === 'Dashboard C-LEVEL' || menuName === 'Meu Núcleo' || menuName === 'Dashboard Operações';
    }
    if (activeTab === 'Meus Bookings') {
      return menuName === 'Meus Bookings' || menuName === 'Concluir Job' || menuName === 'Meus Bookings / Alocações';
    }
    if (activeTab === 'Banco de Freelancers') {
      return menuName === 'Banco de Freelancers' || menuName === 'Buscar Freelancers';
    }
    if (activeTab === 'Shortlist') {
      return menuName === 'Shortlist & Negociação';
    }
    if (activeTab === 'Sugerir Freelancer') {
      return menuName === 'Sugerir Novo Freela';
    }
    if (activeTab === 'Sugestões de Freelas') {
      return menuName === 'Sugestões de Freelas';
    }
    if (activeTab === 'Avaliar Freelancers') {
      return menuName === 'Avaliar Freela';
    }
    if (activeTab === 'Relatórios & Exportar') {
      return menuName === 'Relatórios & Exportar' || menuName === 'Relatórios';
    }
    if (activeTab === 'Gestão de Usuários') {
      return menuName === 'Gestão de Usuários' || menuName === 'Gestão de Usuários dos Núcleos';
    }
    return activeTab === menuName;
  };

  // 1. LOGIN SCREEN RENDER
  if (!isLoggedIn || !currentUser) {
    return (
      <div id="login-container" className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center p-4 selection:bg-action-cyan selection:text-black">
        <div className="w-full max-w-sm bg-[var(--bg-surface)] rounded-3xl overflow-hidden border border-[var(--border-subtle)] shadow-2xl p-8 space-y-6 animate-fade-in relative">
          
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-100 blur-2xl rounded-full"></div>
          
          {/* Logo and Subtitle Section */}
          <div className="text-center space-y-3 relative z-10 flex flex-col items-center">
            <BrandLogo variant="login" />
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] select-none mt-2">
                Freela <span className="text-amber-600">Hub</span>
              </h1>
              <p className="text-xs text-[var(--text-muted)] font-medium select-none mt-1">Gestão centralizada de freelancers</p>
              <p className="text-[10px] text-[var(--text-disabled)] font-extrabold uppercase tracking-wider mt-1">Plataforma interna V3A</p>
            </div>
          </div>

          {/* Login Validation Messages inside the card block */}
          {loginError && (
            <div className="bg-red-500/15 border border-red-200 text-rose-200 p-3 px-4 rounded-xl text-[11px] leading-relaxed flex gap-2 animate-shake">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{loginError}</span>
            </div>
          )}

          {/* Form wrapper */}
          <form onSubmit={handleManualLogin} className="space-y-4 text-xs">
            
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">E-mail Corporativo</label>
              <input
                type="email"
                required
                placeholder="nome@v3a.ag"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] p-2.5 rounded-xl text-[var(--text-primary)] outline-none focus:border-action-cyan text-xs transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Senha de Segurança</label>
              <input
                type="password"
                required
                placeholder="Insira sua senha..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] p-2.5 rounded-xl text-[var(--text-primary)] outline-none focus:border-action-cyan text-xs transition-colors"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="bg-action-cyan hover:brightness-95 text-black font-extrabold p-3 w-full rounded-xl flex items-center justify-center gap-1 transition-all text-xs cursor-pointer shadow-sm"
              >
                Entrar na Plataforma <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Visual Link Only */}
          <div className="text-center pt-2">
            <span className="text-[10px] text-[var(--text-disabled)] font-semibold cursor-not-allowed hover:underline">
              Esqueci minha senha
            </span>
          </div>

        </div>
      </div>
    );
  }

  // 2. COMPULSORY PASSWORD CHANGE SCREEN (First Login Access Check)
  if (currentUser.firstAccessPending) {
    return (
      <div id="compulsory-password-container" className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center p-4 selection:bg-action-cyan">
        <div className="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-8 rounded-3xl shadow-2xl text-xs space-y-5 relative">
          
          <div className="absolute top-0 left-0 w-32 h-32 bg-amber-500/10 blur-2xl rounded-full"></div>
          
          <div className="text-center space-y-1 relative z-10">
            <Lock className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <h2 className="text-lg font-bold text-[var(--text-primary)] uppercase tracking-wider">Primeiro Acesso Pendente</h2>
            <p className="text-[11px] text-[var(--text-muted)]">Olá <strong>{currentUser.name}</strong>, para garantir a segurança cibernética corporativa da agência, cadastre uma nova senha pessoal.</p>
          </div>

          {compulsoryError && (
            <div className="bg-red-500/15 border border-red-200 text-rose-200 p-3 rounded-xl leading-relaxed flex gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{compulsoryError}</span>
            </div>
          )}

          <form onSubmit={handleCompulsoryPasswordSubmit} className="space-y-4">
            
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Senha Inicial (Atual)</label>
              <input
                type="password"
                required
                placeholder="Insira a senha recebida..."
                value={compulsoryCurrentPassword}
                onChange={e => setCompulsoryCurrentPassword(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] p-2.5 rounded-xl text-[var(--text-primary)] outline-none focus:border-action-cyan"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Nova Senha Pessoal</label>
              <input
                type="password"
                required
                placeholder="Crie sua nova senha..."
                value={compulsoryNewPassword}
                onChange={e => setCompulsoryNewPassword(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] p-2.5 rounded-xl text-[var(--text-primary)] outline-none focus:border-action-cyan"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Confirmar Nova Senha</label>
              <input
                type="password"
                required
                placeholder="Confirme sua nova senha..."
                value={compulsoryConfirmPassword}
                onChange={e => setCompulsoryConfirmPassword(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] p-2.5 rounded-xl text-[var(--text-primary)] outline-none focus:border-action-cyan"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-600 text-black font-extrabold p-3 w-full rounded-xl text-xs transition duration-200 flex justify-center items-center gap-1 cursor-pointer"
              >
                Atualizar senha e acessar plataforma
              </button>
            </div>
          </form>

          <div className="text-center pt-2">
            <button
              onClick={handleLogOut}
              className="text-[var(--text-disabled)] hover:text-[var(--text-primary)] transition underline"
            >
              Cancelar e Voltar ao Login
            </button>
          </div>

        </div>
      </div>
    );
  }

  // 3. CORE LOGGED-IN WORKSPACE LAYOUT RENDER
  return (
    <div 
      id="app-workspace" 
      style={{ '--sidebar-width': isSidebarCollapsed ? '80px' : '256px' } as React.CSSProperties}
      className="min-h-screen md:h-screen md:overflow-hidden bg-bg-app flex flex-col md:grid md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] selection:bg-action-cyan selection:text-black"
    >
      
      {/* ============ MOBILE BACKDROP ============ */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ============ 1. SIDEBAR ============ */}
      {/* Mobile: fixed overlay drawer | Desktop: relative sidebar */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-50 w-72
          md:relative md:z-40
          bg-white flex flex-col text-slate-800 shrink-0
          border-r border-[#E2E3E4]
          overflow-y-auto overflow-x-hidden
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
          md:w-[var(--sidebar-width)]
          safe-top
        `}
      >
        {/* Brand header */}
        <div className={`
          border-b border-[#E2E3E4] flex bg-white transition-[height,padding] duration-300 ease-in-out
          ${isSidebarCollapsed 
            ? 'h-[100px] flex-col justify-center items-center gap-3 py-4 px-2' 
            : 'h-[120px] items-center justify-between px-6 py-5'}
        `}>
          <SidebarBrand collapsed={isSidebarCollapsed} />
          
          <div className={`flex items-center gap-1.5 ${isSidebarCollapsed ? 'w-full justify-center' : ''}`}>
            {/* Collapse button — desktop only */}
            <button
              onClick={toggleSidebar}
              className="hidden md:flex p-1.5 rounded-lg text-[var(--text-disabled)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors cursor-pointer"
              aria-label={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
              title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            
            {/* Close button — mobile only */}
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-[var(--text-disabled)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors"
              aria-label="Fechar menu"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-4 space-y-1 font-sans text-xs font-semibold overflow-y-auto">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const isSelected = isMenuSelected(item.name);

            return (
              <div key={idx} className="relative group">
                <button
                  onClick={() => handleMenuClick(item.name)}
                  className={`w-full text-left p-3 rounded-xl flex items-center transition-all cursor-pointer min-h-[44px]
                    ${isSelected 
                      ? 'bg-action-cyan text-black shadow-sm font-extrabold' 
                      : 'text-slate-600 hover:bg-white/5 hover:text-[var(--text-primary)]'}
                    ${isSidebarCollapsed ? 'justify-center' : 'gap-2.5'}`}
                  aria-label={item.name}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-black' : 'text-[var(--text-disabled)]'}`} />
                  {!isSidebarCollapsed && <span>{item.name}</span>}
                </button>

                {isSidebarCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-[#636466] text-white text-[11px] font-bold rounded-lg shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap border border-[var(--border-default)]">
                    {item.name}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Static Sidebar Identity Card */}
        <div className={`p-4 border-t border-[#E2E3E4] bg-white text-xs safe-bottom flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-600 text-[10px] uppercase shrink-0" title={`${currentUser.name} (Perfil: ${getRoleLabel(currentUser.profile)})`}>
            {currentUser.name.slice(0, 2)}
          </div>
          {!isSidebarCollapsed && (
            <div className="truncate">
              <p className="font-bold text-[var(--text-primary)] leading-tight truncate">{currentUser.name}</p>
              <span className="text-[9px] text-[#A2E9F2] font-semibold block mt-0.5">
                PERFIL: {getRoleLabel(currentUser.profile)}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* 2. MAIN APPLICATION CONTENT COLUMN */}
      <main className="flex-1 flex flex-col min-w-0 md:h-screen md:overflow-hidden relative z-10">
        
        {/* Dynamic Top Header Bar */}
        <header className="bg-white border-b border-border-subtle p-3 px-4 md:p-4 md:px-6 flex justify-between items-center relative z-[100] shadow-xs safe-top">
          
          {/* Mobile: Hamburger + Logo | Desktop: Breadcrumbs */}
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg text-text-secondary hover:bg-slate-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Abrir menu"
              aria-expanded={isMobileMenuOpen}
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Mobile breadcrumb (compact) */}
            <div className="md:hidden">
              <span className="font-extrabold text-text-primary text-sm uppercase tracking-wide">{activeTab}</span>
            </div>

            {/* Desktop breadcrumb */}
            <div className="hidden md:block text-xs">
              <span className="text-text-secondary font-semibold">Plataforma</span> &bull; <strong className="text-text-primary text-xs uppercase font-extrabold">{activeTab}</strong>
            </div>
          </div>

          {/* Unified Safe Identity Indicator & Top Dropdown menu */}
          <div className="flex items-center gap-2 md:gap-4 relative">
            
            {/* Role Switcher Selector for MASTER users */}
            {isMasterAccount ? (
              <div className="relative z-[100]">
                <button 
                  onClick={() => setIsRoleSwitcherOpen(!isRoleSwitcherOpen)}
                  className="flex items-center gap-1.5 bg-[#FFF6D6] hover:bg-[#FFE680] text-black border border-[#FFE680] text-[10px] font-extrabold px-3 py-1.5 rounded-full uppercase tracking-wider transition cursor-pointer select-none shadow-xs min-h-[36px]"
                  title="Alternar Perfil de Acesso (Simulação Master)"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-900" />
                  <span>PERFIL: {getRoleLabel(currentUser.profile)}</span>
                  <ChevronDown className="w-3 h-3 text-black ml-0.5" />
                </button>

                {isRoleSwitcherOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[9999] overflow-hidden text-xs font-semibold animate-scale-up p-1.5">
                    <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 rounded-xl mb-1">
                      <p className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">Alternar Perfil de Acesso</p>
                      <p className="text-[9px] text-amber-700 font-medium">Modo Administrador Master</p>
                    </div>
                    
                    {['MASTER', 'RH', 'C-LEVEL', 'OPERAÇÕES', 'NÚCLEO'].map((roleKey) => {
                      const isActive = getRoleLabel(currentUser.profile) === roleKey;
                      return (
                        <button
                          key={roleKey}
                          onClick={() => {
                            handleSwitchProfile(roleKey);
                            setIsRoleSwitcherOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition text-xs font-bold cursor-pointer my-0.5 ${
                            isActive 
                              ? 'bg-[#FFCB05] text-black shadow-xs' 
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>{roleKey}</span>
                          {isActive && <Check className="w-4 h-4 text-black" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <span className="bg-[var(--bg-surface)] text-[var(--text-primary)] text-[9px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider hidden sm:inline-block">
                Perfil: {getRoleLabel(currentUser.profile)}
              </span>
            )}

            {/* Profile trigger dropdown button */}
            <div className="relative z-[100]">
              <button 
                onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                className="flex items-center gap-2 hover:bg-slate-50 p-1.5 px-2 md:px-3 rounded-xl transition text-xs border border-border-subtle cursor-pointer select-none min-h-[44px]"
              >
                <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold uppercase text-slate-800">
                  {currentUser.name.slice(0, 2)}
                </div>
                <div className="text-left hidden md:block">
                  <p className="font-bold text-text-primary leading-none text-[11px]">{currentUser.name}</p>
                </div>
                <span className="text-text-secondary text-[10px] hidden md:inline">▼</span>
              </button>

              {/* Popover Dropdown menu */}
              {isHeaderMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-border-subtle rounded-xl shadow-lg z-[9999] overflow-hidden text-xs font-semibold animate-scale-up">
                  <div className="p-3 bg-slate-50 border-b border-border-subtle md:hidden">
                    <p className="font-bold text-text-primary">{currentUser.name}</p>
                    <p className="text-[10px] text-text-secondary mt-0.5">Perfil: {getRoleLabel(currentUser.profile)}</p>
                  </div>

                  {/* MASTER Profile Switcher Section in Popover */}
                  {isMasterAccount && (
                    <div className="p-2.5 border-b border-border-subtle bg-amber-50/50">
                      <p className="text-[10px] text-amber-900 px-1 mb-1.5 uppercase tracking-wider font-extrabold flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-800" /> ALTERNAR PERFIL DE ACESSO
                      </p>
                      <div className="grid grid-cols-1 gap-1">
                        {['MASTER', 'RH', 'C-LEVEL', 'OPERAÇÕES', 'NÚCLEO'].map((roleKey) => {
                          const isActive = getRoleLabel(currentUser.profile) === roleKey;
                          return (
                            <button
                              key={roleKey}
                              onClick={() => {
                                handleSwitchProfile(roleKey);
                                setIsHeaderMenuOpen(false);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold transition flex items-center justify-between cursor-pointer ${
                                isActive 
                                  ? 'bg-[#FFCB05] text-black shadow-xs' 
                                  : 'text-slate-700 hover:bg-slate-100 bg-white border border-slate-200'
                              }`}
                            >
                              <span>{roleKey}</span>
                              {isActive && <Check className="w-3.5 h-3.5 text-black" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => { setActiveTab('Meu Perfil'); setIsHeaderMenuOpen(false); }}
                    className="w-full text-left p-3 hover:bg-slate-50 flex items-center gap-2 text-text-primary min-h-[44px]"
                  >
                    <UserSquare2 className="w-4 h-4 text-[var(--text-disabled)]" /> Meu Perfil
                  </button>
                  <button 
                    onClick={() => { setActiveTab('Meu Perfil'); setIsHeaderMenuOpen(false); }}
                    className="w-full text-left p-3 hover:bg-slate-50 flex items-center gap-2 text-text-primary border-b border-border-subtle min-h-[44px]"
                  >
                    <Key className="w-4 h-4 text-[var(--text-disabled)]" /> Alterar Senha
                  </button>
                  <div className="p-2.5 border-b border-border-subtle bg-slate-50/50">
                    <p className="text-[10px] text-text-secondary px-1 mb-2 uppercase tracking-wider font-bold">Tema da Interface</p>
                    <div className="grid grid-cols-3 gap-1 bg-white border border-border-subtle p-0.5 rounded-lg">
                      <button
                        onClick={() => setTheme('light')}
                        className={`py-1.5 rounded-md text-[10px] font-bold transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                          theme === 'light'
                            ? 'bg-[#00BCD4] text-[var(--text-primary)] shadow-xs'
                            : 'text-text-secondary hover:bg-slate-50'
                        }`}
                        title="Tema Claro"
                      >
                        <Sun className="w-3.5 h-3.5" />
                        <span>Claro</span>
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        className={`py-1.5 rounded-md text-[10px] font-bold transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                          theme === 'dark'
                            ? 'bg-[#00BCD4] text-[var(--text-primary)] shadow-xs'
                            : 'text-text-secondary hover:bg-slate-50'
                        }`}
                        title="Tema Escuro"
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>Escuro</span>
                      </button>
                      <button
                        onClick={() => setTheme('system')}
                        className={`py-1.5 rounded-md text-[10px] font-bold transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                          theme === 'system'
                            ? 'bg-[#00BCD4] text-[var(--text-primary)] shadow-xs'
                            : 'text-text-secondary hover:bg-slate-50'
                        }`}
                        title="Usar preferência do sistema"
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        <span>Sistema</span>
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={handleLogOut}
                    className="w-full text-left p-3 hover:bg-red-50 text-red-700 flex items-center gap-2 min-h-[44px]"
                  >
                    <LogOut className="w-4 h-4 text-red-500" /> Sair da Plataforma
                  </button>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* Active Simulation Alert Banner */}
        {isMasterAccount && simulatedProfile && (
          <div className="bg-[#FFF6D6] border-b border-[#FFE680] px-4 py-2 text-xs flex flex-wrap items-center justify-between text-black font-semibold z-20 gap-2">
            <div className="flex items-center gap-2">
              <span className="bg-amber-900 text-white text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider">Simulação Ativa</span>
              <span>Você está visualizando a plataforma como perfil: <strong className="uppercase font-black text-amber-950">{simulatedProfile}</strong></span>
            </div>
            <button
              onClick={() => handleSwitchProfile('MASTER')}
              className="bg-black text-white hover:bg-slate-800 text-[10px] font-extrabold px-3 py-1 rounded-lg transition cursor-pointer shadow-xs"
            >
              Restaurar Perfil MASTER ↺
            </button>
          </div>
        )}

        {/* 3. SCROLLABLE ROUTE VIEWPORT */}
        <div id="main-scroll-container" className="flex-1 overflow-y-auto px-6 pb-6 focus:outline-none bg-bg-app">
          <div className="pt-6">
          
          {/* Dashboard router dependent on selected profile */}
          {activeTab === 'Dashboard' && getRoleLabel(currentUser.profile) === 'MASTER' && (
            <DashboardMaster db={db} />
          )}

          {activeTab === 'Dashboard' && getRoleLabel(currentUser.profile) === 'RH' && (
            <DashboardRh db={db} />
          )}

          {activeTab === 'Dashboard' && (getRoleLabel(currentUser.profile) === 'OPERAÇÕES' || getRoleLabel(currentUser.profile) === 'OPERAÇÃO') && (
            <DashboardOperacao db={db} />
          )}

          {activeTab === 'Dashboard' && (getRoleLabel(currentUser.profile) === 'NÚCLEO' || getRoleLabel(currentUser.profile) === 'C-LEVEL') && (
            <DashboardNucleo db={db} />
          )}

          {/* New Custom Router Tabs */}
          {activeTab === 'Gestão de Usuários' && (
            can(currentUser, 'users.view') ? (
              <UserManagement db={db} />
            ) : (
              <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-border-subtle shadow-xs max-w-md mx-auto my-12 text-center animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <Lock className="w-8 h-8 text-red-500 animate-pulse" />
                </div>
                <h3 className="text-base font-bold text-text-primary mb-2">Acesso Restrito</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  O perfil {getRoleLabel(currentUser?.profile)} não possui permissão para acessar este módulo.
                </p>
              </div>
            )
          )}

          {activeTab === 'Meu Perfil' && (
            <PerfilUsuario db={db} />
          )}

          {activeTab === 'Links Públicos / QR Codes' && (
            <PublicLinksPanel db={db} />
          )}

          {activeTab === 'Análise de Pré-cadastros' && (
            can(currentUser, 'preRegistrations.view') ? (
              <PublicSubmissionsPanel db={db} />
            ) : (
              <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-border-subtle shadow-xs max-w-md mx-auto my-12 text-center animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <Lock className="w-8 h-8 text-red-500 animate-pulse" />
                </div>
                <h3 className="text-base font-bold text-text-primary mb-2">Acesso Restrito</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  O perfil {getRoleLabel(currentUser?.profile)} não possui permissão para acessar este módulo.
                </p>
              </div>
            )
          )}

          {/* Existing Operational Router Tabs */}
          {activeTab === 'Cadastro de Núcleos' && (
            can(currentUser, 'nuclei.view') ? (
              <NucleosPanel db={db} />
            ) : (
              <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-border-subtle shadow-xs max-w-md mx-auto my-12 text-center animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <Lock className="w-8 h-8 text-red-500 animate-pulse" />
                </div>
                <h3 className="text-base font-bold text-text-primary mb-2">Acesso Restrito</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  O perfil {getRoleLabel(currentUser?.profile)} não possui permissão para acessar este módulo.
                </p>
              </div>
            )
          )}

          {activeTab === 'Banco de Freelancers' && (
            <BancoFreelas db={db} />
          )}

          {activeTab === 'Perfil do Freelancer' && (
            <PerfilFreela db={db} />
          )}

          {activeTab === 'Cadastrar Freelancer' && (
            <FormFreela db={db} onCancel={() => setActiveTab('Banco de Freelancers')} />
          )}

          {/* Retired suggestions tabs */}

          {activeTab === 'Criar Oportunidade' && (
            <FormOportunidade db={db} onCancel={() => setActiveTab('Dashboard')} />
          )}

          {activeTab === 'Shortlist' && (
            <ShortlistPanel db={db} />
          )}

          {activeTab === 'Meus Bookings' && (
            <BookingsPanel db={db} />
          )}

          {activeTab === 'Política de Valores' && (
            <ExcecaoPanel db={db} />
          )}

          {activeTab === 'Timeline de Alocações' && (
            <TimelineAlocacoes db={db} />
          )}



          {activeTab === 'Avaliar Freelancers' && (
            <EvaluationForm db={db} />
          )}

          {activeTab === 'Relatórios & Exportar' && (
            <RelatoriosPanel db={db} />
          )}

          {activeTab === 'Base 3D / Cenografia' && (
            <Base3DPanel db={db} />
          )}

          </div>
        </div>
      </main>
    </div>
  );
}
