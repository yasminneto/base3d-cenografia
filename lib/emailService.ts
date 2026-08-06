import nodemailer from 'nodemailer';
import path from "path";

import { supabase, getSupabaseAdmin } from './supabase';

export interface SendProposalEmailParams {
  recipientEmail: string;
  recipientName: string;
  jobId: string;
  jobCode: string;
  jobTitle: string;
  clientName: string;
  nucleoName: string;
  roleName: string;
  seniority: string;
  startDate: string;
  endDate: string;
  remunerationModel: string;
  baseValue: number;
  proposalUrl: string;
  publicLinkId?: string;
  proposalInvitationId?: string;
  createdByUserId?: string;
}

/**
 * Server-side service to dispatch proposal e-mails via Google Workspace SMTP (freelahub@v3a.ag)
 * and audit events in email_events table.
 */
export async function sendProposalEmail(params: SendProposalEmailParams): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const fromEmail = process.env.FREELAHUB_EMAIL_FROM || 'Freela Hub V3A <freelahub@v3a.ag>';
    const templateKey = 'proposal_dispatch';

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Record email_event as pending
    const { data: eventRecord, error: insertError } = await supabaseAdmin
      .from('email_events')
      .insert({
        event_type: templateKey,
        recipient_email: params.recipientEmail,
        recipient_name: params.recipientName,
        template_key: templateKey,
        related_job_id: params.jobId,
        related_job_code: params.jobCode,
        related_public_link_id: params.publicLinkId || null,
        related_proposal_invitation_id: params.proposalInvitationId || null,
        status: 'pending',
        created_by: params.createdByUserId || null,
        metadata: {
          job_title: params.jobTitle,
          client_name: params.clientName,
          proposal_url: params.proposalUrl,
          from_email: fromEmail,
        },
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to create email_event:', insertError);
    }

    const eventId = eventRecord?.id;

    // 2. Format email subject & bodies (Text and HTML)
    const emailSubject = `Proposta de Oportunidade V3A — [${params.jobCode}] ${params.jobTitle}`;
    const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(params.baseValue || 0);

    const emailBodyText = `
Olá, ${params.recipientName}.

Você foi selecionado para avaliar uma oportunidade de atuação junto à V3A no FREELA HUB.

DADOS DA OPORTUNIDADE:
• ID do Job: ${params.jobCode}
• Job: ${params.jobTitle}
• Cliente / Projeto: ${params.clientName}
• Núcleo Contratante: ${params.nucleoName}
• Função: ${params.roleName} (${params.seniority})
• Período Estimado: ${params.startDate} a ${params.endDate}
• Modelo de Remuneração: ${params.remunerationModel}
• Valor-Base Proposto: ${formattedValue}

Para visualizar os detalhes completos do escopo, entregáveis e responder se ACEITA ou RECUSA a proposta, acesse o link seguro abaixo:

👉 ${params.proposalUrl}

⚠️ Aviso Importante: O pagamento depende da abertura e aprovação da RC pelo núcleo contratante no ERP de Supply, respeitando os prazos e políticas internas.

Este link é individual, temporário e permite apenas uma resposta.

Atenciosamente,
Equipe FREELA HUB | V3A Live Marketing
`.trim();

    const appUrl = process.env.FREELAHUB_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://v3-a-freelahub.vercel.app'));
    const emailHtmlBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Geologica:wght@300;400;500;600;700;800;900&display=swap');
    
    body { 
      font-family: 'Geologica', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
      background-color: #0b0f19; 
      color: #e2e8f0; 
      margin: 0; 
      padding: 40px 20px; 
    }
    .container { 
      max-width: 640px; 
      margin: 0 auto; 
      background-color: #131b2e; 
      border: 1px solid rgba(255, 255, 255, 0.05); 
      border-radius: 20px; 
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .header { 
      padding: 40px 30px; 
      text-align: center; 
      background: linear-gradient(180deg, #0f172a 0%, #131b2e 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .header img {
      width: 180px;
      height: auto;
      margin-bottom: 24px;
      display: block;
      margin-left: auto;
      margin-right: auto;
    }
    .header p { 
      color: #94a3b8; 
      margin: 0; 
      font-size: 14px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .content { 
      padding: 40px 32px; 
    }
    .greeting { 
      font-size: 24px; 
      color: #ffffff; 
      font-weight: 700; 
      margin-bottom: 16px;
      letter-spacing: -0.5px;
    }
    .intro-text {
      font-size: 15px; 
      color: #cbd5e1; 
      line-height: 1.6;
      margin-bottom: 32px;
      font-weight: 300;
    }
    .card { 
      background-color: #0f172a; 
      border: 1px solid rgba(255, 255, 255, 0.05); 
      border-radius: 16px; 
      padding: 28px; 
      margin: 32px 0; 
      box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.2);
    }
    .card-title { 
      color: #06b6d4; 
      font-size: 12px; 
      font-weight: 800; 
      text-transform: uppercase; 
      letter-spacing: 1.5px; 
      margin-bottom: 20px; 
      border-bottom: 1px solid rgba(255, 255, 255, 0.05); 
      padding-bottom: 12px; 
    }
    .row { 
      margin-bottom: 12px; 
      font-size: 14px;
    }
    .label { 
      color: #64748b; 
      display: inline-block; 
      width: 170px; 
      font-weight: 500;
      font-size: 13px;
    }
    .value { 
      color: #f8fafc; 
      font-weight: 600; 
    }
    .value-highlight { 
      color: #10b981; 
      font-weight: 800; 
      font-size: 18px; 
    }
    .cta-container { 
      text-align: center; 
      margin: 40px 0 32px 0; 
    }
    .btn { 
      display: inline-block; 
      background: linear-gradient(135deg, #06b6d4 0%, #0284c7 100%);
      color: #ffffff; 
      font-weight: 800; 
      text-decoration: none; 
      padding: 18px 40px; 
      border-radius: 12px; 
      font-size: 16px;
      letter-spacing: 0.5px;
      box-shadow: 0 10px 25px -5px rgba(6, 182, 212, 0.4);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .disclaimer { 
      background-color: rgba(245, 158, 11, 0.05); 
      border-left: 3px solid #f59e0b;
      padding: 16px 20px; 
      font-size: 12px; 
      color: #fbbf24; 
      margin-top: 32px; 
      line-height: 1.6;
      border-radius: 0 8px 8px 0;
    }
    .footer { 
      background-color: #0b0f19; 
      padding: 24px; 
      text-align: center; 
      font-size: 12px; 
      color: #475569; 
      font-weight: 400;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${appUrl}/brand/v3a-logo-yellow.png" alt="FREELA HUB | V3A" />
      <p>Proposta Oficial de Oportunidade</p>
    </div>
    <div class="content">
      <div class="greeting">Olá, ${params.recipientName}!</div>
      <p class="intro-text">
        Você foi selecionado para avaliar uma oportunidade de atuação profissional junto à <strong>V3A Live Marketing</strong>.
      </p>

      <div class="card">
        <div class="card-title">Resumo da Oportunidade [${params.jobCode}]</div>
        
        <div class="row">
          <span class="label">ID do Job:</span>
          <span class="value" style="color: #06b6d4;">${params.jobCode}</span>
        </div>
        <div class="row">
          <span class="label">Job / Projeto:</span>
          <span class="value">${params.jobTitle}</span>
        </div>
        <div class="row">
          <span class="label">Cliente:</span>
          <span class="value">${params.clientName}</span>
        </div>
        <div class="row">
          <span class="label">Núcleo:</span>
          <span class="value">${params.nucleoName}</span>
        </div>
        <div class="row">
          <span class="label">Função:</span>
          <span class="value">${params.roleName} (${params.seniority})</span>
        </div>
        <div class="row">
          <span class="label">Período:</span>
          <span class="value">${params.startDate} a ${params.endDate}</span>
        </div>
        <div class="row">
          <span class="label">Remuneração:</span>
          <span class="value" style="text-transform: capitalize;">${
            params.remunerationModel === 'monthly' || params.remunerationModel === 'monthly_salary' ? 'Mensal' : 
            params.remunerationModel === 'hourly' ? 'Por Hora' : 
            params.remunerationModel === 'fixed_job' ? 'Job Fechado / Por Projeto' : 
            params.remunerationModel === 'daily' ? 'Diária' : params.remunerationModel
          }</span>
        </div>
        
        <div class="row" style="margin-top: 24px; margin-bottom: 0;">
          <span class="label" style="color: #cbd5e1; font-weight: 600;">Valor-Base Proposto:</span>
          <span class="value value-highlight">${formattedValue}</span>
        </div>
      </div>

      <div class="cta-container">
        <a href="${params.proposalUrl}" class="btn" target="_blank">Visualizar & Responder Proposta &rarr;</a>
        <p style="margin-top: 16px; font-size: 13px; color: #94a3b8; font-weight: 500;">
          ⏳ Este link é individual e expirará em <strong>7 dias</strong>.
        </p>
      </div>

      <div class="disclaimer">
        <strong style="display: block; margin-bottom: 8px;">⚠️ Avisos Importantes:</strong>
        <ul style="margin: 0; padding-left: 16px; space-y: 4px;">
          <li>Por favor, <strong>não responda diretamente a este e-mail</strong>. Utilize exclusivamente o botão acima para interagir com a proposta.</li>
          <li style="margin-top: 6px;">O pagamento depende da abertura e aprovação da RC pelo núcleo contratante no ERP de Supply, respeitando os prazos e políticas internas da V3A.</li>
        </ul>
      </div>
    </div>
    <div class="footer">
      FREELA HUB &copy; V3A Live Marketing<br>
      <span style="display: block; margin-top: 8px; color: #334155;">Este e-mail é individual, confidencial e intransferível.</span>
    </div>
  </div>
</body>
</html>
`.trim();

    // 3. Setup Nodemailer Transporter
    const host = process.env.FREELAHUB_SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.FREELAHUB_SMTP_PORT || '465', 10);
    const secure = process.env.FREELAHUB_SMTP_SECURE !== 'false';
    const user = process.env.FREELAHUB_SMTP_USER;
    const pass = process.env.FREELAHUB_SMTP_PASS;

    if (!user || !pass) {
      throw new Error('FREELAHUB_SMTP_USER/FREELAHUB_SMTP_PASS não configurados no ambiente do servidor.');
    }

    console.log(`[EmailService] Sending proposal email via SMTP (${host}:${port}) to ${params.recipientEmail}`);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false
      }
    });

    const info = await transporter.sendMail({
      from: fromEmail,
      to: params.recipientEmail,
      subject: emailSubject,
      text: emailBodyText,
      html: emailHtmlBody,
      attachments: []
    });

    console.log(`[EmailService] Email sent successfully! MessageId: ${info.messageId}`);

    // 4. Update email_event as sent
    if (eventId) {
      await supabaseAdmin
        .from('email_events')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: info.messageId || `msg_${Date.now()}`,
        })
        .eq('id', eventId);
    }

    return { success: true, eventId };
  } catch (err: any) {
    console.error('[EmailService] Error dispatching email via SMTP:', err);
    
    // Update event status to failed if eventId exists
    // Using try/catch so we don't throw inside the catch block if eventId is missing in scope
    try {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.from('email_events').update({
        status: 'failed',
        error_message: err.message || 'Erro desconhecido',
      }).eq('recipient_email', params.recipientEmail).eq('status', 'pending');
    } catch (e) {}

    return { success: false, error: err.message || 'Erro ao enviar e-mail por SMTP.' };
  }
}

export interface SendProposalResponseNotificationParams {
  headEmail: string;
  headName: string;
  freelancerName: string;
  jobTitle: string;
  jobCode: string;
  responseType: 'accepted' | 'accepted_with_reservations' | 'refused';
  notes?: string;
}

export async function sendProposalResponseNotificationEmail(params: SendProposalResponseNotificationParams): Promise<{ success: boolean; error?: string }> {
  try {
    const fromEmail = process.env.FREELAHUB_EMAIL_FROM || 'Freela Hub V3A <freelahub@v3a.ag>';
    const host = process.env.FREELAHUB_SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.FREELAHUB_SMTP_PORT || '465', 10);
    const secure = process.env.FREELAHUB_SMTP_SECURE !== 'false';
    const user = process.env.FREELAHUB_SMTP_USER;
    const pass = process.env.FREELAHUB_SMTP_PASS;

    if (!user || !pass) {
      throw new Error('FREELAHUB_SMTP_USER/FREELAHUB_SMTP_PASS não configurados no ambiente do servidor.');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    let statusText = '';
    let statusColor = '';
    
    if (params.responseType === 'accepted') {
      statusText = 'ACEITOU A PROPOSTA';
      statusColor = '#10b981'; // emerald-500
    } else if (params.responseType === 'accepted_with_reservations') {
      statusText = 'ACEITOU COM RESSALVA (Negociação)';
      statusColor = '#f59e0b'; // amber-500
    } else {
      statusText = 'RECUSOU A PROPOSTA';
      statusColor = '#ef4444'; // red-500
    }

    const appUrl = process.env.FREELAHUB_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://v3-a-freelahub.vercel.app'));
    const emailHtmlBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; margin: 0; padding: 40px 20px; line-height: 1.5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #131b2e; border-radius: 20px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
    .header { padding: 40px 30px; text-align: center; background: linear-gradient(180deg, #0f172a 0%, #131b2e 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    .header img { width: 180px; height: auto; margin-bottom: 24px; display: block; margin-left: auto; margin-right: auto; }
    .header p { color: #94a3b8; margin: 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px; }
    .content { padding: 40px 32px; }
    .greeting { font-size: 24px; color: #ffffff; font-weight: 700; margin-bottom: 16px; letter-spacing: -0.5px; }
    .intro-text { font-size: 15px; color: #cbd5e1; line-height: 1.6; margin-bottom: 32px; font-weight: 300; }
    .card { background-color: #0f172a; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 28px; margin: 32px 0; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.2); }
    .status-badge { display: inline-block; padding: 8px 16px; background-color: rgba(255,255,255,0.05); border: 1px solid ${statusColor}; color: ${statusColor}; border-radius: 8px; font-weight: 800; font-size: 14px; margin-bottom: 24px; }
    .row { margin-bottom: 12px; font-size: 14px; }
    .label { color: #64748b; display: inline-block; width: 170px; font-weight: 500; font-size: 13px; }
    .value { color: #f8fafc; font-weight: 600; }
    .notes-box { margin-top: 24px; padding: 16px; background-color: rgba(255,255,255,0.02); border-left: 3px solid ${statusColor}; color: #cbd5e1; font-size: 14px; font-style: italic; }
    .footer { background-color: #0b0f19; padding: 24px; text-align: center; font-size: 12px; color: #475569; font-weight: 400; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${appUrl}/brand/v3a-logo-yellow.png" alt="FREELA HUB | V3A" />
      <p>Atualização de Proposta</p>
    </div>
    <div class="content">
      <div class="greeting">Olá, ${params.headName}!</div>
      <p class="intro-text">
        O freelancer <strong>${params.freelancerName}</strong> respondeu à proposta da oportunidade <strong>${params.jobTitle} [${params.jobCode}]</strong>.
      </p>

      <div class="card">
        <div class="status-badge">${statusText}</div>
        
        <div class="row">
          <span class="label">Freelancer:</span>
          <span class="value">${params.freelancerName}</span>
        </div>
        <div class="row">
          <span class="label">Job ID:</span>
          <span class="value">${params.jobCode}</span>
        </div>
        
        ${params.notes ? '<div class="notes-box">"' + params.notes + '"</div>' : ''}
      </div>
      
      <p style="color: #94a3b8; font-size: 14px;">
        Acesse o painel do Freela Hub na aba <strong>Shortlist & Negociação</strong> para dar prosseguimento ao fluxo.
      </p>
    </div>
    <div class="footer">
      FREELA HUB | Plataforma Interna V3A<br>
      Este é um e-mail automático, não é necessário responder.
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailBodyText = `
Olá, ${params.headName}!

O freelancer ${params.freelancerName} respondeu à proposta da oportunidade ${params.jobTitle} [${params.jobCode}].

Status da Resposta: ${statusText}

${params.notes ? 'Observações/Motivo: ' + params.notes : ''}

Acesse o painel do Freela Hub na aba Shortlist & Negociação para dar prosseguimento ao fluxo.

FREELA HUB | V3A Live Marketing
    `.trim();

    const info = await transporter.sendMail({
      from: fromEmail,
      to: params.headEmail,
      subject: `[Freela Hub] Resposta de Proposta - ${params.freelancerName} (${params.jobCode})`,
      text: emailBodyText,
      html: emailHtmlBody,
      attachments: []
    });

    console.log('[EmailService] Notification email sent:', info.messageId);
    return { success: true };
  } catch (err: any) {
    console.error('[EmailService] Error sending notification email:', err);
    return { success: false, error: err.message };
  }
}
