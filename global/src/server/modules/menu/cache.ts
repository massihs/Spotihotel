/** Cache tag of a restaurant's public menu. Every menu mutation must invalidate it. */
export const menuTag = (restaurantId: string) => `menu:${restaurantId}`;
