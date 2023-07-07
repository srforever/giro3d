<div align="center">
  <a href="https://giro3d.org">
    <img src="https://giro3d.org/images/giro3d_logo.svg" height="120">
  </a>
</div>

## Introduction

Welcome to the API documentation of Giro3D.

➡️ If you are looking for an interactive tutorial, please look at the  [getting started](https://giro3d.org/tutorials/getting-started.html) page instead.

Here is a brief overview of the main concepts behind Giro3D.

## Instance

The [`Instance`](./classes/core.Instance.html) is the entry point of a Giro3D context. It contains [**entities**](./modules/entities.html) that represent dynamically updated objects and make the most of a Giro3D scene. Each instance is hosted by a DOM element (a `<div>`) that will contain the `<canvas>` used to render the scene.

```js
// Get the DOM element that will contain the Giro3D instance
const div = document.getElementById('giro3d-view');

const instance = new Instance(div);
```

Under the hood, Giro3D uses three.js to render the scene. To directly access the three.js scene, you can use the [`scene`](./classes/core.Instance.html#scene) property.

To add an entity to the instance, use the [`Instance.add()`](./classes/core.Instance.html#add) method. Note that this method can be used to add a regular three.js [`Object3D`](https://threejs.org/docs/?q=obje#api/en/core/Object3D)s as well.

💡 You can have multiple instances in the same web page, as long as each of them has its own canvas.

### The main loop

Contrary to many video games or other interactive applications, Giro3D updates its state and renders the scene to the canvas **only when notified**, instead of periodically (for example 60 times per second). Many classes in Giro3D notify the instance when something has changed (mainly entities), but not all changes can be detected by Giro3D.

💡 To manually trigger an Instance update, you can use the [`Instance.notifyChange()`](./classes/core.Instance.html#notifyChange) method. This is useful when the state of the scene has changed in a way that Giro3D cannot detect:

```js
const instance = new Instance(...);

// Do something that Giro3D cannot detect, such as changing a CSS style.

// Make sure that Giro3D is notified.
instance.notifyChange();
```

## Entities

[Entities](./modules/entities.html) are the first-class citizens in Giro3D. Each entity manages a collection of renderable objects, and is responsible for their life cycle. The root 3D object of the entity can be accessed through the [object3d](./classes/entities.Entity3D.html#object3d) accessor.

For example, the [`Map`](./classes/entities.Map.html) entity represents a 2D or 2.5D surface split into hierarchical tiles.

💡 To implement your own renderable entity, create a subclass of the [`Entity3D`](./classes/entities.Entity3D.html) class:

```js
class MyCustomEntity extends Entity3D {
    constructor() {
        super(id, new THREE.Group());
    }
}
```

### Life cycle of the entity

Each entity follows this cycle:

- **Initialization**: once, after the entity has been added to the instance
- **Update**, while the entity is present in the instance.
- **Disposal**, when the entity is removed from the instance

The most important is the **update** step. The methods associated with this step are called each time the instance is updated. (See [The main loop](#the-main-loop)).

Initialization and disposal are optional steps, and you do not have to implement them if not necessary. However, the initialization step is necessary in many cases to perform asynchronous preparation of the entity (e.g download files), and disposal is necessary if the entity handles unmanaged resources, such as textures and geometries (see below).

💡 Hidden entities are not updated. See the [visible](./classes/entities.Entity3D.html#visible) property for more information.

### The `progress` and `loading` properties

The `Entity` class provides an API to determine if an entity is currently processing data (e.g downloading map tiles): [`loading`](./classes/entities.Entity3D.html#loading) and [`progress`](./classes/entities.Entity3D.html#progress).

- `loading` is a boolean that indicates whether the entity is currently performing an asynchronous task.
- `progress` is a number (between zero and one) that indicates the percentage of progress of the tasks this entity is performing.

💡 To help implementing this API, you can use the [`OperationCounter`](./classes/core.OperationCounter.html) class.

## Memory management

Most objects in Giro3D are automatically managed by the garbage collector, ensuring that no memory leak happens.

However, some objects, such as three.js [textures](https://threejs.org/docs/?q=texture#api/en/textures/Texture), must be manually disposed. In this case, refer to the relevant documentation to determine if the object is manually managed.

💡 three.js's [`WebGLRenderer`](https://threejs.org/docs/index.html?q=webglrenderer#api/en/renderers/WebGLRenderer.info) has an `info` property that returns the number of unmanaged resources in GPU memory. You can access this renderer from the `Instance` using the [`renderer`](./classes/core.Instance.html#renderer) property.
