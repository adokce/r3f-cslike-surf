declare module "three" {
  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    [key: string]: any;
  }

  export class Euler {
    constructor(x?: number, y?: number, z?: number, order?: string);
    [key: string]: any;
  }

  export class Matrix4 {
    constructor();
    [key: string]: any;
  }

  export class Mesh {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class Camera {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export const MathUtils: {
    euclideanModulo: (value: number, mod: number) => number;
  };
}
