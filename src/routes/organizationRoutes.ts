import { Router, Request, Response } from "express";
import { authenticateToken } from "../middlewares/authorizatizeToken";
import { requireOrganizationMembership, requireOrganizationManagementRole } from "../middlewares/requireOrganizationMembership";
import { OrganizationService, OrganizationServiceError } from "../services/organizationService";
import { OrganizationManagementRole as Role } from "../models/organization";
import { EmailService } from "../services/emailService";

const service = new OrganizationService();
const router = Router();
const userId = (req: Request) => (req.user?.userId || req.user?.id)!;
const handle = (action: (req: Request) => Promise<unknown>, status = 200) => async (req: Request, res: Response) => {
  try { res.status(status).json(await action(req)); }
  catch (error) { res.status(error instanceof OrganizationServiceError ? error.statusCode : 500).json({ message: error instanceof Error ? error.message : "Erro na organização" }); }
};
router.use(authenticateToken);
router.get("/", handle(async req => (await service.listUserOrganizations(userId(req))).map(item => ({ ...item.organization, membership: item.membership }))));
router.post("/", handle(req => service.createOrganization(userId(req), req.body), 201));
router.use("/:organizationId/invitations", requireOrganizationMembership, requireOrganizationManagementRole(Role.Owner, Role.OrganizationAdmin, Role.Leader));
router.get("/:organizationId/invitations", handle(req => service.listInvitations(req.params.organizationId)));
router.post("/:organizationId/invitations", handle(async req => {
  const result = await service.createInvitation(req.params.organizationId, userId(req), req.body);
  const org = (await service.listUserOrganizations(userId(req))).find(item => item.organization.id === req.params.organizationId)!;
  const invitationPath = `/invite/${org.organization.slug}/${result.token}`;
  let emailSent = false;
  if (process.env.APP_PUBLIC_URL && process.env.RESEND_API_KEY) {
    const link = new URL(invitationPath, process.env.APP_PUBLIC_URL);
    if (!["https:", "http:"].includes(link.protocol)) throw new Error("APP_PUBLIC_URL inválida");
    try {
      await new EmailService().sendLeaderNotification({ to: [result.invitation.email], subject: "Convite para participar de uma organização", html: `<p>Você recebeu um convite para participar da agenda musical.</p><p><a href="${link.href}">Abrir convite</a></p><p>Entre usando o e-mail que recebeu este convite.</p>` });
      emailSent = true;
    } catch { console.error("Não foi possível enviar o convite por e-mail. O link continua disponível para compartilhamento."); }
  }
  return { ...result, invitationPath, emailSent };
}, 201));
router.delete("/:organizationId/invitations/:invitationId", handle(req => service.revokeInvitation(req.params.organizationId, req.params.invitationId, userId(req))));

export const invitationRoutes = Router();
invitationRoutes.get("/:slug/:token/preview", handle(req => service.previewInvitation(req.params.slug, req.params.token)));
invitationRoutes.post("/:slug/:token/accept", authenticateToken, handle(req => service.acceptInvitation(req.params.slug, req.params.token, userId(req))));
export default router;
