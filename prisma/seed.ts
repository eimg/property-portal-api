import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }) });

const locations: Array<[string, string, string, string | null]> = [
  ["Yangon", "yangon", "CITY", null], ["Mandalay", "mandalay", "CITY", null],
  ["Bahan", "bahan", "TOWNSHIP", "yangon"], ["Dagon", "dagon", "TOWNSHIP", "yangon"], ["Hlaing", "hlaing", "TOWNSHIP", "yangon"], ["Insein", "insein", "TOWNSHIP", "yangon"], ["Kamaryut", "kamaryut", "TOWNSHIP", "yangon"], ["Mayangone", "mayangone", "TOWNSHIP", "yangon"], ["Sanchaung", "sanchaung", "TOWNSHIP", "yangon"], ["Tamwe", "tamwe", "TOWNSHIP", "yangon"],
  ["Amarapura", "amarapura", "TOWNSHIP", "mandalay"], ["Chanayethazan", "chanayethazan", "TOWNSHIP", "mandalay"], ["Chanmyathazi", "chanmyathazi", "TOWNSHIP", "mandalay"], ["Maha Aungmyay", "maha-aungmyay", "TOWNSHIP", "mandalay"], ["Pyigyidagun", "pyigyidagun", "TOWNSHIP", "mandalay"],
];
const categories: Array<[string, string]> = [["Land", "land"], ["Apartment", "apartment"], ["Condominium", "condominium"], ["House", "house"], ["Room / Shared accommodation", "room"], ["Shop / Office", "shop-office"], ["Warehouse / Factory", "warehouse"], ["Building", "building"], ["Other", "other"]];
const amenities: Array<[string, string]> = [["Parking", "parking"], ["Security", "security"], ["Backup generator", "backup-generator"], ["Elevator", "elevator"], ["Air conditioning", "air-conditioning"], ["Garden", "garden"], ["Near public transport", "near-public-transport"]];
const sampleImages = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1200&q=85",
];

async function main() {
  await prisma.$transaction([
    prisma.listingAmenity.deleteMany(), prisma.listingImage.deleteMany(), prisma.savedListing.deleteMany(), prisma.inquiry.deleteMany(), prisma.moderationAction.deleteMany(), prisma.auditEvent.deleteMany(), prisma.listing.deleteMany(), prisma.agencyMember.deleteMany(), prisma.agency.deleteMany(), prisma.amenity.deleteMany(), prisma.propertyCategory.deleteMany(), prisma.location.deleteMany(), prisma.userRole.deleteMany(), prisma.user.deleteMany(),
  ]);
  const passwordHash = await bcrypt.hash("demo-password-123", 12);
  const seedUsers: Array<[string, string, string]> = [
    ["admin@property.local", "Property Admin", "ADMIN"], ["owner@property.local", "Mya Owner", "OWNER"], ["agent@property.local", "Yangon Homes Agent", "AGENT"], ["customer@property.local", "Demo Customer", "BUYER_RENTER"],
  ];
  const users = await Promise.all(seedUsers.map(async ([email, name, role]) => prisma.user.create({ data: { email, name, passwordHash, roles: { create: { role } } } })));
  const owner = users[1]!;
  const agent = users[2]!;
  const agency = await prisma.agency.create({ data: { name: "Golden Roof Realty", slug: "golden-roof-realty", description: "Fictional demo agency" } });
  await prisma.agencyMember.create({ data: { agencyId: agency.id, userId: agent.id } });
  const locationMap = new Map<string, string>();
  for (const [name, slug, type, parentSlug] of locations) {
    const parentId = parentSlug ? locationMap.get(parentSlug) : undefined;
    const record = await prisma.location.create({ data: { name, slug, type, parentId } });
    locationMap.set(slug, record.id);
  }
  const categoryMap = new Map<string, string>();
  for (const [name, slug] of categories) { const record = await prisma.propertyCategory.create({ data: { name, slug } }); categoryMap.set(slug, record.id); }
  const amenityMap = new Map<string, string>();
  for (const [name, slug] of amenities) { const record = await prisma.amenity.create({ data: { name, slug } }); amenityMap.set(slug, record.id); }
  const citySlugs = ["yangon", "mandalay"];
  const townshipSlugs = locations.filter((location) => location[2] === "TOWNSHIP").map((location) => location[1]);
  const categorySlugs = categories.map((category) => category[1]);
  const statuses = ["ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE", "PENDING_REVIEW", "DRAFT", "REMOVED", "REMOVED", "REMOVED", "REJECTED"];
  for (let index = 0; index < 80; index += 1) {
    const city = citySlugs[index % citySlugs.length]!;
    const cityTownships = locations.filter((location) => location[2] === "TOWNSHIP" && location[3] === city);
    const township = cityTownships[Math.floor(index / citySlugs.length) % cityTownships.length]![1];
    const category = categorySlugs[index % categorySlugs.length]!;
    const transactionType = index % 3 === 0 ? "RENT" : "SALE";
    const status = statuses[index % statuses.length]!;
    const manager = index % 2 === 0 ? owner : agent;
    const listing = await prisma.listing.create({ data: { slug: `demo-property-${index + 1}`, title: `${category.replace(/-/g, " ")} near ${township.replace(/-/g, " ")}`, description: `A fictional sample ${transactionType.toLowerCase()} listing prepared for the Property Portal demo. It includes a practical location, clear pricing, and representative property details for review.`, transactionType, status, priceMMK: transactionType === "RENT" ? 450000 + index * 25000 : 85000000 + index * 5000000, rentFrequency: transactionType === "RENT" ? "MONTHLY" : undefined, address: `${township.replace(/-/g, " ")}, ${city}`, locationId: locationMap.get(township)!, categoryId: categoryMap.get(category)!, managerId: manager.id, agencyId: manager.id === agent.id ? agency.id : undefined, bedrooms: index % 4, bathrooms: 1 + (index % 3), buildingArea: 700 + index * 12, buildingAreaUnit: "SQ_FT", furnished: index % 2 === 0, publishedAt: status === "ACTIVE" ? new Date() : undefined, removedAt: status === "REMOVED" ? new Date() : undefined, images: { create: [{ url: sampleImages[index % sampleImages.length]!, altText: `Sample property ${index + 1}`, isPrimary: true }] }, amenities: { create: [{ amenityId: amenityMap.get(amenities[index % amenities.length]![1])! }, { amenityId: amenityMap.get(amenities[(index + 2) % amenities.length]![1])! }] } } });
    if (index < 20) await prisma.savedListing.create({ data: { userId: users[3]!.id, listingId: listing.id } });
    if (index < 25) await prisma.inquiry.create({ data: { listingId: listing.id, customerId: users[3]!.id, recipientId: manager.id, message: `I would like more information about ${listing.title}.`, preferredContact: "EMAIL", contactValue: users[3]!.email, status: ["NEW", "CONTACTED", "IN_PROGRESS", "CLOSED", "SPAM"][index % 5]! } });
  }
  console.log("Seeded demo accounts, catalog, 80 listings, saved listings, and inquiries.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
