import type { RequestHandler } from "express";

export const asyncRoute = (handler: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export function publicListing(listing: any) {
  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    description: listing.description,
    transactionType: listing.transactionType,
    status: listing.status,
    priceMMK: listing.priceMMK,
    currency: listing.currency,
    rentFrequency: listing.rentFrequency,
    address: listing.address,
    landArea: listing.landArea,
    landAreaUnit: listing.landAreaUnit,
    buildingArea: listing.buildingArea,
    buildingAreaUnit: listing.buildingAreaUnit,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    floors: listing.floors,
    parkingCount: listing.parkingCount,
    furnished: listing.furnished,
    yearBuilt: listing.yearBuilt,
    isFeatured: listing.isFeatured,
    publishedAt: listing.publishedAt,
    createdAt: listing.createdAt,
    location: listing.location,
    category: listing.category,
    images: listing.images,
    amenities: listing.amenities?.map((item: any) => item.amenity),
    manager: listing.manager ? { id: listing.manager.id, name: listing.manager.name } : undefined,
  };
}

export function ownerListing(listing: any) {
  return {
    ...publicListing(listing),
    latestModerationAction: listing.moderationActions?.[0] ?? null,
  };
}
