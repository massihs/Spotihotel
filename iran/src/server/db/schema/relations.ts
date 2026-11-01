import { relations } from "drizzle-orm";
import { complaintAttachments, complaints, reviews } from "./engagement";
import { categories, optionGroups, optionValues, productImages, productOptionGroups, products } from "./menu";
import {
  cartItems,
  carts,
  invoices,
  orderItems,
  orderStatusEvents,
  orders,
  paymentAllocations,
  payments,
} from "./orders";
import { authSessions, organizationMembers, organizations, plans, subscriptions, users } from "./platform";
import { restaurantMembers, restaurantSettings, restaurants, taxRates } from "./restaurant";
import { diningTables, guests, sessionParticipants, tableSessions } from "./tables";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(authSessions),
  memberships: many(restaurantMembers),
  organizationMemberships: many(organizationMembers),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  restaurants: many(restaurants),
  members: many(organizationMembers),
  subscriptions: many(subscriptions),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
}));

export const restaurantsRelations = relations(restaurants, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [restaurants.organizationId],
    references: [organizations.id],
  }),
  settings: one(restaurantSettings, {
    fields: [restaurants.id],
    references: [restaurantSettings.restaurantId],
  }),
  members: many(restaurantMembers),
  tables: many(diningTables),
  categories: many(categories),
  products: many(products),
  taxRates: many(taxRates),
}));

export const restaurantMembersRelations = relations(restaurantMembers, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [restaurantMembers.restaurantId],
    references: [restaurants.id],
  }),
  user: one(users, { fields: [restaurantMembers.userId], references: [users.id] }),
}));

export const diningTablesRelations = relations(diningTables, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [diningTables.restaurantId],
    references: [restaurants.id],
  }),
  sessions: many(tableSessions),
}));

export const tableSessionsRelations = relations(tableSessions, ({ one, many }) => ({
  table: one(diningTables, { fields: [tableSessions.tableId], references: [diningTables.id] }),
  participants: many(sessionParticipants),
  orders: many(orders),
}));

export const sessionParticipantsRelations = relations(sessionParticipants, ({ one, many }) => ({
  session: one(tableSessions, {
    fields: [sessionParticipants.tableSessionId],
    references: [tableSessions.id],
  }),
  guest: one(guests, { fields: [sessionParticipants.guestId], references: [guests.id] }),
  orders: many(orders),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  taxRate: one(taxRates, { fields: [products.taxRateId], references: [taxRates.id] }),
  images: many(productImages),
  optionGroups: many(productOptionGroups),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const optionGroupsRelations = relations(optionGroups, ({ many }) => ({
  values: many(optionValues),
  products: many(productOptionGroups),
}));

export const optionValuesRelations = relations(optionValues, ({ one }) => ({
  group: one(optionGroups, { fields: [optionValues.groupId], references: [optionGroups.id] }),
}));

export const productOptionGroupsRelations = relations(productOptionGroups, ({ one }) => ({
  product: one(products, { fields: [productOptionGroups.productId], references: [products.id] }),
  group: one(optionGroups, { fields: [productOptionGroups.groupId], references: [optionGroups.id] }),
}));

export const cartsRelations = relations(carts, ({ many, one }) => ({
  items: many(cartItems),
  participant: one(sessionParticipants, {
    fields: [carts.participantId],
    references: [sessionParticipants.id],
  }),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  product: one(products, { fields: [cartItems.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  items: many(orderItems),
  statusEvents: many(orderStatusEvents),
  allocations: many(paymentAllocations),
  table: one(diningTables, { fields: [orders.tableId], references: [diningTables.id] }),
  session: one(tableSessions, { fields: [orders.tableSessionId], references: [tableSessions.id] }),
  participant: one(sessionParticipants, {
    fields: [orders.participantId],
    references: [sessionParticipants.id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));

export const orderStatusEventsRelations = relations(orderStatusEvents, ({ one }) => ({
  order: one(orders, { fields: [orderStatusEvents.orderId], references: [orders.id] }),
}));

export const paymentsRelations = relations(payments, ({ many }) => ({
  allocations: many(paymentAllocations),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(payments, { fields: [paymentAllocations.paymentId], references: [payments.id] }),
  order: one(orders, { fields: [paymentAllocations.orderId], references: [orders.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  payment: one(payments, { fields: [invoices.paymentId], references: [payments.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  order: one(orders, { fields: [reviews.orderId], references: [orders.id] }),
}));

export const complaintsRelations = relations(complaints, ({ many, one }) => ({
  attachments: many(complaintAttachments),
  order: one(orders, { fields: [complaints.orderId], references: [orders.id] }),
}));

export const complaintAttachmentsRelations = relations(complaintAttachments, ({ one }) => ({
  complaint: one(complaints, {
    fields: [complaintAttachments.complaintId],
    references: [complaints.id],
  }),
}));
