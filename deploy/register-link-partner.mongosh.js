const now = new Date();
const tenant = db.tenants.findOne({ slug: "servnet", enabled: true });
const actorEmail = (process.env.LINK_PARTNER_ACTOR_EMAIL || "").trim().toLowerCase();

if (!actorEmail) throw new Error("Define LINK_PARTNER_ACTOR_EMAIL antes de registrar Link Partner");
const actor = db.users.findOne({ email: actorEmail, enabled: true });

if (!tenant) throw new Error("No existe el tenant activo servnet");
if (!actor) throw new Error(`No existe el usuario activo ${actorEmail}`);

db.applications.updateOne(
  { slug: "link-partner" },
  {
    $set: {
      name: "Link Partner",
      shortDescription: "Opera conectividad on-net y off-net con cobertura, proveedores, SLA y seguimiento de entrega.",
      description: "Plataforma para publicar, cotizar, adjudicar y entregar enlaces mediante la cascada Red Servnet, proveedores gestionados y marketplace.",
      category: "operations",
      subcategory: "connectivity-sourcing",
      tags: ["conectividad", "carriers", "proveedores", "service-delivery"],
      accentColor: "#B5502F",
      lifecycle: "beta",
      visibility: "private",
      enabled: true,
      updatedAt: now
    },
    $setOnInsert: { createdBy: actor._id, createdAt: now }
  },
  { upsert: true }
);

const application = db.applications.findOne({ slug: "link-partner" });

db.deployments.updateOne(
  { applicationId: application._id, label: "Link Partner staging" },
  {
    $set: {
      baseUrl: "https://ai-stg-node02.serv.net.mx:3446",
      launchPath: "/",
      version: "0.2.0",
      hostingType: "on_premise",
      allocation: "shared",
      dedicatedTenantId: null,
      status: "active",
      keycloakClientId: "link-partner-frontend",
      notes: "Mac Studio ai-stg-node02, red app-hub-staging_default, puerto HTTPS 3446.",
      updatedAt: now
    },
    $setOnInsert: { createdBy: actor._id, createdAt: now }
  },
  { upsert: true }
);

const deployment = db.deployments.findOne({
  applicationId: application._id,
  label: "Link Partner staging"
});

db.tenantappassignments.updateOne(
  { tenantId: tenant._id, deploymentId: deployment._id },
  {
    $set: {
      applicationId: application._id,
      status: "active",
      isPrimary: true,
      source: "manual",
      revokedAt: null,
      expiresAt: null,
      updatedAt: now
    },
    $setOnInsert: {
      grantedBy: actor._id,
      grantedAt: now,
      createdAt: now
    }
  },
  { upsert: true }
);

const assignment = db.tenantappassignments.findOne({
  tenantId: tenant._id,
  deploymentId: deployment._id
});

db.userappaccesses.updateOne(
  { assignmentId: assignment._id, userId: actor._id },
  {
    $set: {
      tenantId: tenant._id,
      applicationId: application._id,
      status: "active",
      revokedAt: null,
      updatedAt: now
    },
    $setOnInsert: {
      grantedBy: actor._id,
      grantedAt: now,
      createdAt: now
    }
  },
  { upsert: true }
);

printjson({
  application: { id: application._id, slug: application.slug, enabled: application.enabled },
  deployment: { id: deployment._id, baseUrl: deployment.baseUrl, status: deployment.status },
  assignment: { id: assignment._id, tenant: tenant.slug, status: assignment.status },
  userAccess: { email: actor.email, status: "active" }
});
