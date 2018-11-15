# sprite-generator

Purpose of this utility to simplify generation of sprite sheets (CSS sprites).

Built on top of [spritesmith](https://github.com/Ensighten/spritesmith) and [svg-sprite](https://github.com/jkphl/svg-sprite).

## Example

```typescript
let {SpriteGenerator} = require('sprite-generator');

let sprite = new SpriteGenerator({
  sprites: [
    // PNG icons
    {name: 'png-pack', sourceFolder: 'images/png'},
    // SVG icons
    {name: 'svg-pack', sourceFolder: 'images/svg', include: /\.svg$/i},
  ],

  targetFolder: {
    icons: 'build/images/sprites',
    scss: 'src/build/sprites',
    ts: 'src/build/sprites'
  },

  classes: {
    base: 'i',
    sprite: 's',
    size: 'x',
    icon: 'i'
  },

  url: `image-path('sprites/#SPRITE_FILE')`
});

sprite.generate();
```

Utility will create several `scss` and `ts` files in `targetFolder`.

# License
Licensed under the MIT license.