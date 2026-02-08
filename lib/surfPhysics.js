/**
 * Clamp a vertical position to the ground plane.
 * @param {number} positionY
 * @param {number} velocityY
 * @param {number} groundTop
 * @param {number} radius
 */
export const applyGroundClamp = (
  positionY,
  velocityY,
  groundTop,
  radius
) => {
  if (positionY - radius < groundTop) {
    return { y: groundTop + radius, velocityY: 0, grounded: true };
  }

  return { y: positionY, velocityY, grounded: false };
};
