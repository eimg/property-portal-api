import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { z } from "zod";
import { authMiddleware, comparePassword, hashPassword, issueToken, requireAuth, requireRole } from "./auth.js";
import { prisma } from "./db.js";
import { asyncRoute, ownerListing, publicListing } from "./http.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.use(authMiddleware);

const registerSchema = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(2), phone: z.string().optional(), role: z.enum(["BUYER_RENTER", "OWNER", "AGENT"]).default("BUYER_RENTER") });
const listingSchema = z.object({
  title: z.string().min(5), description: z.string().min(20), transactionType: z.enum(["SALE", "RENT"]),
  priceMMK: z.number().int().min(1).max(2_147_483_647), currency: z.literal("MMK").default("MMK"), rentFrequency: z.string().optional(),
  address: z.string().max(500).optional(), locationId: z.string().min(1), categoryId: z.string().min(1), bedrooms: z.number().int().nonnegative().optional(),
  bathrooms: z.number().int().nonnegative().optional(), buildingArea: z.number().positive().optional(), buildingAreaUnit: z.string().optional(),
  landArea: z.number().positive().optional(), landAreaUnit: z.string().optional(), furnished: z.boolean().optional(), parkingCount: z.number().int().nonnegative().optional(), imageUrl: z.string().url().optional(), imageUrls: z.array(z.string().url()).min(1).max(10).optional(),
});
const inquirySchema = z.object({ message: z.string().min(10), preferredContact: z.enum(["PHONE", "EMAIL", "INQUIRY"]), contactValue: z.string().optional() });

app.get("/health", (_req, res) => res.json({ ok: true, service: "property-portal-api" }));

app.post("/api/v1/auth/register", asyncRoute(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const exists = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (exists) return res.status(409).json({ error: { code: "EMAIL_TAKEN", message: "An account with this email already exists" } });
  const user = await prisma.user.create({ data: { email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password), name: input.name, phone: input.phone, roles: { create: { role: input.role } } }, include: { roles: true } });
  const auth = { id: user.id, email: user.email, roles: user.roles.map((role) => role.role) };
  res.status(201).json({ token: issueToken(auth), user: { id: user.id, email: user.email, name: user.name, roles: auth.roles } });
}));

app.post("/api/v1/auth/login", asyncRoute(async (req, res) => {
  const input = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() }, include: { roles: true } });
  if (!user || !user.isActive || !(await comparePassword(input.password, user.passwordHash))) return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" } });
  const auth = { id: user.id, email: user.email, roles: user.roles.map((role) => role.role) };
  res.json({ token: issueToken(auth), user: { id: user.id, email: user.email, name: user.name, roles: auth.roles } });
}));

app.get("/api/v1/me", requireAuth, asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.id }, include: { roles: true } });
  res.json({ id: user?.id, email: user?.email, name: user?.name, phone: user?.phone, roles: user?.roles.map((role) => role.role) ?? [] });
}));

const listingInclude = { location: true, category: true, images: { orderBy: { sortOrder: "asc" as const } }, amenities: { include: { amenity: true } }, manager: true, moderationActions: { orderBy: { createdAt: "desc" as const }, take: 1, select: { action: true, reason: true, createdAt: true } } };

app.get("/api/v1/listings", asyncRoute(async (req, res) => {
  const query = z.object({ q: z.string().max(120).optional(), transactionType: z.enum(["SALE", "RENT"]).optional(), cityId: z.string().optional(), townshipId: z.string().optional(), locationId: z.string().optional(), categoryId: z.string().optional(), minPrice: z.coerce.number().int().min(0).max(2_147_483_647).optional(), maxPrice: z.coerce.number().int().min(1).max(2_147_483_647).optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
  const priceRange = query.minPrice !== undefined || query.maxPrice !== undefined ? { priceMMK: { ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}), ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}) } } : {};
  const locationFilter = query.townshipId || query.locationId
    ? { locationId: query.townshipId ?? query.locationId, ...(query.cityId ? { location: { parentId: query.cityId } } : {}) }
    : query.cityId ? { location: { parentId: query.cityId } } : {};
  const where = { status: "ACTIVE", ...(query.transactionType ? { transactionType: query.transactionType } : {}), ...locationFilter, ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...priceRange, ...(query.q ? { OR: [{ title: { contains: query.q } }, { description: { contains: query.q } }, { address: { contains: query.q } }, { location: { name: { contains: query.q } } }, { category: { name: { contains: query.q } } }] } : {}) };
  const [items, total] = await Promise.all([prisma.listing.findMany({ where, include: listingInclude, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.listing.count({ where })]);
  res.json({ items: items.map(publicListing), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } });
}));

app.get("/api/v1/listings/:slug", asyncRoute(async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { slug: String(req.params.slug) }, include: listingInclude });
  if (!listing || listing.status !== "ACTIVE") return res.status(404).json({ error: { code: "NOT_FOUND", message: "Listing not found" } });
  res.json(publicListing(listing));
}));

app.get("/api/v1/locations", asyncRoute(async (_req, res) => res.json(await prisma.location.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }))));
app.get("/api/v1/categories", asyncRoute(async (_req, res) => res.json(await prisma.propertyCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }))));

app.post("/api/v1/listings", requireAuth, requireRole("OWNER", "AGENT"), asyncRoute(async (req, res) => {
  const input = listingSchema.parse(req.body);
  const { imageUrl, imageUrls, ...listingInput } = input;
  const [location, category] = await Promise.all([prisma.location.findFirst({ where: { id: input.locationId, type: "TOWNSHIP", isActive: true, parent: { type: "CITY", slug: { in: ["yangon", "mandalay"] } } } }), prisma.propertyCategory.findFirst({ where: { id: input.categoryId, isActive: true } })]);
  if (!location || !category) return res.status(400).json({ error: { code: "INVALID_LOCATION_OR_CATEGORY", message: "Choose an available township and property category" } });
  const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
  const urls = imageUrls ?? [imageUrl ?? "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85"];
  const listing = await prisma.listing.create({ data: { ...listingInput, slug, managerId: req.auth!.id, images: { create: urls.map((url, sortOrder) => ({ url, altText: input.title, sortOrder, isPrimary: sortOrder === 0 })) } }, include: listingInclude });
  res.status(201).json(ownerListing(listing));
}));

app.patch("/api/v1/listings/:id", requireAuth, requireRole("OWNER", "AGENT"), asyncRoute(async (req, res) => {
  const input = listingSchema.partial().parse(req.body);
  const existing = await prisma.listing.findFirst({ where: { id: String(req.params.id), managerId: req.auth!.id } });
  if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Listing not found" } });
  if (!["DRAFT", "REJECTED"].includes(existing.status)) return res.status(409).json({ error: { code: "INVALID_TRANSITION", message: "Only draft or rejected listings can be edited" } });
  const { imageUrl, imageUrls, ...data } = input;
  if (data.locationId) {
    const location = await prisma.location.findFirst({ where: { id: data.locationId, type: "TOWNSHIP", parent: { type: "CITY", slug: { in: ["yangon", "mandalay"] } } } });
    if (!location) return res.status(400).json({ error: { code: "INVALID_LOCATION", message: "Choose a township in Yangon or Mandalay" } });
  }
  if (data.categoryId && !await prisma.propertyCategory.findFirst({ where: { id: data.categoryId, isActive: true } })) return res.status(400).json({ error: { code: "INVALID_CATEGORY", message: "Choose an available property category" } });
  const imageUpdate = imageUrls ? { deleteMany: {}, create: imageUrls.map((url, sortOrder) => ({ url, altText: data.title ?? existing.title, sortOrder, isPrimary: sortOrder === 0 })) } : imageUrl ? { deleteMany: {}, create: { url: imageUrl, altText: data.title ?? existing.title, sortOrder: 0, isPrimary: true } } : undefined;
  const updated = await prisma.listing.update({ where: { id: existing.id }, data: { ...data, ...(imageUpdate ? { images: imageUpdate } : {}) }, include: listingInclude });
  res.json(ownerListing(updated));
}));

app.delete("/api/v1/listings/:id", requireAuth, requireRole("OWNER", "AGENT"), asyncRoute(async (req, res) => {
  const existing = await prisma.listing.findFirst({ where: { id: String(req.params.id), managerId: req.auth!.id } });
  if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Listing not found" } });
  const updated = await prisma.listing.update({ where: { id: existing.id }, data: { status: "REMOVED", removedAt: new Date() }, include: listingInclude });
  res.json(ownerListing(updated));
}));

app.get("/api/v1/me/listings", requireAuth, requireRole("OWNER", "AGENT", "ADMIN"), asyncRoute(async (req, res) => {
  const where = req.auth!.roles.some((role) => ["ADMIN"].includes(role)) ? {} : { managerId: req.auth!.id };
  const listings = await prisma.listing.findMany({ where, include: listingInclude, orderBy: { updatedAt: "desc" } });
  res.json(listings.map(ownerListing));
}));

app.post("/api/v1/listings/:id/submit", requireAuth, requireRole("OWNER", "AGENT"), asyncRoute(async (req, res) => {
  const listing = await prisma.listing.findFirst({ where: { id: String(req.params.id), managerId: req.auth!.id } });
  if (!listing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Listing not found" } });
  if (!["DRAFT", "REJECTED"].includes(listing.status)) return res.status(409).json({ error: { code: "INVALID_TRANSITION", message: "This listing cannot be submitted" } });
  const updated = await prisma.listing.update({ where: { id: listing.id }, data: { status: "PENDING_REVIEW" }, include: listingInclude });
  res.json(ownerListing(updated));
}));

app.get("/api/v1/admin/listings/review-queue", requireAuth, requireRole("ADMIN"), asyncRoute(async (_req, res) => {
  const listings = await prisma.listing.findMany({ where: { status: "PENDING_REVIEW" }, include: listingInclude, orderBy: { updatedAt: "asc" } });
  res.json(listings.map(publicListing));
}));

app.post("/api/v1/admin/listings/:id/:action", requireAuth, requireRole("ADMIN"), asyncRoute(async (req, res) => {
  const action = z.enum(["approve", "reject", "unpublish", "remove"]).parse(String(req.params.action));
  const reason = z.object({ reason: z.string().trim().min(1).max(500).optional() }).parse(req.body ?? {}).reason;
  if (action === "reject" && !reason) return res.status(400).json({ error: { code: "REJECTION_REASON_REQUIRED", message: "Provide a reason when rejecting a listing" } });
  const status = { approve: "ACTIVE", reject: "REJECTED", unpublish: "REMOVED", remove: "REMOVED" }[action];
  const existing = await prisma.listing.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Listing not found" } });
  if (action === "approve" || action === "reject") {
    if (existing.status !== "PENDING_REVIEW") return res.status(409).json({ error: { code: "INVALID_TRANSITION", message: "Only pending listings can be approved or rejected" } });
  } else if (existing.status !== "ACTIVE") return res.status(409).json({ error: { code: "INVALID_TRANSITION", message: "Only active listings can be removed" } });
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.listing.update({ where: { id: existing.id }, data: { status, ...(status === "ACTIVE" ? { publishedAt: existing.publishedAt ?? new Date() } : { removedAt: new Date() }) }, include: listingInclude });
    await tx.moderationAction.create({ data: { listingId: existing.id, actorId: req.auth!.id, action: action.toUpperCase(), reason } });
    await tx.auditEvent.create({ data: { actorId: req.auth!.id, action: `LISTING_${action.toUpperCase()}`, targetType: "Listing", targetId: existing.id, metadataJson: reason ? JSON.stringify({ reason }) : undefined } });
    return next;
  });
  res.json(publicListing(updated));
}));

app.post("/api/v1/listings/:id/save", requireAuth, asyncRoute(async (req, res) => {
  const listingId = String(req.params.id);
  const listing = await prisma.listing.findFirst({ where: { id: listingId, status: "ACTIVE" }, select: { id: true } });
  if (!listing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Listing not found" } });
  await prisma.savedListing.upsert({ where: { userId_listingId: { userId: req.auth!.id, listingId } }, create: { userId: req.auth!.id, listingId }, update: {} });
  res.status(201).json({ saved: true });
}));
app.delete("/api/v1/listings/:id/save", requireAuth, asyncRoute(async (req, res) => { await prisma.savedListing.deleteMany({ where: { userId: req.auth!.id, listingId: String(req.params.id) } }); res.status(204).send(); }));
app.get("/api/v1/me/saved-listings", requireAuth, asyncRoute(async (req, res) => { const saved = await prisma.savedListing.findMany({ where: { userId: req.auth!.id, listing: { status: "ACTIVE" } }, include: { listing: { include: listingInclude } }, orderBy: { createdAt: "desc" } }); res.json(saved.map((item) => publicListing(item.listing))); }));

app.post("/api/v1/listings/:id/inquiries", requireAuth, requireRole("BUYER_RENTER"), asyncRoute(async (req, res) => {
  const input = inquirySchema.parse(req.body);
  const listing = await prisma.listing.findFirst({ where: { id: String(req.params.id), status: "ACTIVE" } });
  if (!listing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Listing not found" } });
  const inquiry = await prisma.inquiry.create({ data: { listingId: listing.id, customerId: req.auth!.id, recipientId: listing.managerId, ...input } });
  res.status(201).json({ id: inquiry.id, status: inquiry.status, createdAt: inquiry.createdAt });
}));
app.get("/api/v1/me/inquiries", requireAuth, asyncRoute(async (req, res) => { res.json(await prisma.inquiry.findMany({ where: { customerId: req.auth!.id }, select: { id: true, listingId: true, customerId: true, recipientId: true, message: true, preferredContact: true, contactValue: true, status: true, createdAt: true, updatedAt: true, listing: { select: { slug: true, title: true } } }, orderBy: { createdAt: "desc" } })); }));
app.get("/api/v1/me/received-inquiries", requireAuth, requireRole("OWNER", "AGENT", "ADMIN"), asyncRoute(async (req, res) => { const where = req.auth!.roles.some((role) => ["ADMIN"].includes(role)) ? {} : { recipientId: req.auth!.id }; res.json(await prisma.inquiry.findMany({ where, select: { id: true, listingId: true, customerId: true, recipientId: true, message: true, preferredContact: true, contactValue: true, status: true, createdAt: true, updatedAt: true, listing: { select: { slug: true, title: true } }, customer: { select: { id: true, name: true, email: true, phone: true } } }, orderBy: { createdAt: "desc" } })); }));

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Check the submitted fields", details: error.flatten() } });
  console.error(error);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
});

export { app };
