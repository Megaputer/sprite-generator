import * as fs from 'fs';
import * as path from 'path';
import Spritesmith = require('spritesmith');
import SVGSpriter = require('svg-sprite');
import pascalCase = require('pascal-case');

/**
 * Limitations for icons:
 *  - file name must not start with numbers.
 */
export interface Sprite {
  // Should be unique for all sprites
  name: string;
  sourceFolder: string;
  // Default: /\.png$/
  include?: RegExp;
}

export interface TargetFolder {
  icons: string;
  scss: string;
  ts: string;
}

/**
 * Used in output SCSS files: '.base.sprite{#}.icon{#}', '.base.size{#}'
 */
export interface CSSClasses {
  base: string;
  sprite: string;
  size: string;
  icon: string;
}

export interface Options {
  sprites: Sprite[];
  padding?: number;
  targetFolder: TargetFolder;
  classes: CSSClasses;
  /**
   * Path in SCSS to sprite.
   * Url must contain `#SPRITE_FILE`, which is replaced by sprite name with extension.
   */
  url: string;
}

interface Icon {
  fileName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpritesmithResult {
  image: any;
  coordinates: {
    [pathIcon: string]: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  properties: {
    width: number;
    height: number;
  };
}

interface Result {
  id: number;
  name: string;
  extension: string;
  icons: Icon[];
  sprite: Buffer;
}

export class SpriteGenerator {
  private options: Options;
  private sizes: number[];
  private queue: number;

  constructor(options: Options) {
    this.options = options;
  }

  generate() {
    this.queue = 0;
    this.sizes = [];

    this.deleteTargetFolders();
    this.options.sprites.forEach((sprite: Sprite, index: number) => {
      const {name, sourceFolder, include = /\.png$/i} = sprite;
      const files = this.getFilePaths(sourceFolder, include);

      if (!files.length) {
        return;
      }

      console.log(`Processing '${name}' from '${sourceFolder}'...`);
      const extensions: string[] = [];
      for (const file of files) {
        const ext = path.parse(file).ext.toLowerCase();
        if (extensions.indexOf(ext) === -1) {
          extensions.push(ext);
        }
      }

      if (extensions.length === 1) {
        switch (extensions[0]) {
          case '.png':
            this.batchPng(name, files, index);
            break;
          case '.svg':
            this.batchSvg(name, files, index);
            break;
          default:
            this.done(`Unsupported file extension: "${extensions[0]}".`);
        }
      } else {
        this.done(`Regular expression "${include.source}" finds different types of files: ${extensions.join(', ')}.`);
      }
    });
  }

  private batchSvg(spriteName: string, files: string[], id: number) {
    const spriter = new SVGSpriter({
      mode: {
        css: true
      },
      shape: {
        spacing: {
          padding: this.options.padding
        }
      }
    });

    for (const file of files) {
      spriter.add(path.resolve(file), undefined, fs.readFileSync(file, {encoding: 'utf-8'}));
    }

    spriter.compile((error, result, data) => {
      if (error) {
        this.done(error.message);
        return;
      }

      const icons: Icon[] = [];
      for (const shape of data.css.shapes) {
        const {name, width, height, position} = shape;
        icons.push({
          fileName: name,
          width: width.inner,
          height: height.inner,
          x: Math.abs(position.absolute.x - (width.outer - width.inner) / 2),
          y: Math.abs(position.absolute.y - (height.outer - height.inner) / 2)
        });
      }

      this.done({
        id,
        name: spriteName,
        extension: '.svg',
        icons,
        sprite: result.css.sprite.contents
      });
    });
  }

  private batchPng(spriteName: string, files: string[], id: number) {
    Spritesmith.run({src: files, padding: this.options.padding}, (error: Error, result: SpritesmithResult) => {
      if (error) {
        this.done(error.message);
        return;
      }

      let icons: Icon[] = [];
      for (let iconPath in result.coordinates) {
        icons.push({
          fileName: path.parse(iconPath).name,
          ...result.coordinates[iconPath]
        });
      }

      this.done({
        id,
        name: spriteName,
        extension: '.png',
        icons,
        sprite: result.image
      });
    });
  }

  private done(data?: string | Result) {
    if (typeof data === 'string') {
      console.error(`Error: ${data}`);
    } else {
      const errors: string[] = [];
      const sizes: number[] = [];
      for (const icon of data.icons) {
        const {width, height} = icon;
        if (width !== height) {
          errors.push(`  Width (${width}px) and height (${height}px) of '${icon.fileName}' have to be same.`);
        } else if (sizes.indexOf(width) === -1 && this.sizes.indexOf(width) === -1) {
          sizes.push(width);
        }
      }

      if (errors.length) {
        console.error(`Errors from sprite '${data.name}':\n` + errors.join('\n'));
      } else {
        this.sizes.push(...sizes);
        this.writeSprite(data);
        this.writeSCSS(data);
        this.writeTS(data);
      }
    }

    if (++this.queue === this.options.sprites.length) {
      this.writeSizesSCSS();
    }
  }

  private deleteFolderRecursive(folderPath: string) {
    if (fs.existsSync(folderPath)) {
      fs.readdirSync(folderPath).forEach((file: string) => {
        const currentPath = path.join(folderPath, file);
        if (fs.lstatSync(currentPath).isDirectory()) {
          this.deleteFolderRecursive(currentPath);
        } else {
          fs.unlinkSync(currentPath);
        }
      });
      fs.rmdirSync(folderPath);
    }
  }

  private deleteTargetFolders() {
    const {targetFolder} = this.options;

    for (const target in targetFolder) {
      this.deleteFolderRecursive(targetFolder[target]);
    }
  }

  private writeSprite(result: Result) {
    this.writeFile(path.join(this.options.targetFolder.icons, `${result.name}${result.extension}`), result.sprite);
  }

  private writeSCSS(result: Result) {
    const {classes} = this.options;
    let output: string = (
      this.getAlertComment() +
      `\n` +
      `@import 'sizes';\n` +
      `\n` +
      `.${classes.base}.${this.getClassName(classes.sprite, result.id)} {\n` +
      `  background-image: url(${this.getSpriteUrl(result)});\n`
    );

    result.icons.forEach((icon, index) => {
      const x = icon.x === 0 ? '0' : `-${icon.x}px`;
      const y = icon.y === 0 ? '0' : `-${icon.y}px`;
      output += (
        `\n` +
        `  // ${icon.fileName}\n` +
        `  &.${this.getClassName(classes.icon, index)} {\n` +
        `    background-position: ${x} ${y};\n` +
        `  }\n`
      );
    });

    output += `}\n`;

    this.writeFile(path.join(this.options.targetFolder.scss, `_${result.name}.scss`), output);
  }

  private writeSizesSCSS() {
    if (!this.sizes.length) {
      return;
    }

    this.sizes.sort((a: number, b: number) => a - b);

    const {classes} = this.options;
    let output: string = (
      this.getAlertComment() +
      `\n$sizes: ${this.sizes.join(' ')};\n` +
      `%common-properties {\n` +
      `  flex-shrink: 0;\n` +
      `}\n` +
      `@each $size in $sizes {\n` +
      `  .${classes.base}.${classes.size}#{$size} {\n` +
      `    @extend %common-properties;\n` +
      `    width: #{$size}px;\n` +
      `    height: #{$size}px;\n` +
      `  }\n` +
      `}\n`
    );

    this.writeFile(path.join(this.options.targetFolder.scss, `_sizes.scss`), output);
  }

  private writeTS(result: Result) {
    let enumValues: string[] = [];
    let infoValues: string[] = [];
    const {classes} = this.options;
    const spriteClassName = this.getClassName(classes.sprite, result.id);
    result.icons.forEach((icon: Icon, index: number) => {
      const sizeClassName = this.getClassName(classes.size, icon.width);
      const iconClassName = this.getClassName(classes.icon, index);
      const classNames = `${classes.base} ${spriteClassName} ${sizeClassName} ${iconClassName}`;

      enumValues.push(`  ${pascalCase(icon.fileName)} = '${classNames}'`);

      const infoValue = [`'${classNames}'`, icon.x, icon.y, icon.width, icon.height];

      infoValues.push(`  '${icon.fileName}': i(${infoValue.join(', ')})`);
    });

    let output: string = (
      this.getAlertComment() +
      `// tslint:disable:max-line-length\n` +
      `import { IconInfoMap, iconInfo as i } from 'common/sprite';`
    );

    // Sprite name
    output += (
      `\n\n` +
      `// Sprite name\n` +
      `export const SPRITE_NAME = '${result.name}';\n\n`
    );

    // enum CSS classes
    output += (
      `export const enum Classes {\n` +
      enumValues.join(`,\n`) +
      `\n}\n\n`
    );

    // map with info
    output += (
      `// Information about the icons\n` +
      `export const info: IconInfoMap = {\n` +
      infoValues.join(`,\n`) +
      `\n};\n`
    );

    this.writeFile(path.join(this.options.targetFolder.ts, `${result.name}.ts`), output);
  }

  private writeFile(filePath: string, data: any) {
    filePath = path.normalize(filePath);

    let file = path.parse(filePath);
    this.createFolderIfNotExist(file.dir);
    fs.writeFileSync(filePath, data);
  }

  private getAlertComment(): string {
    return '// DON\'T MODIFY THIS FILE, IT IS GENERATED AUTOMATICALLY\n';
  }

  private createFolderIfNotExist(folderPath: string) {
    const callback = (currentPath: string, folder: string) => {
      currentPath = path.join(currentPath, folder);
      if (!fs.existsSync(currentPath)) {
        fs.mkdirSync(currentPath);
      }
      return currentPath;
    };
    folderPath.split(path.sep).reduce(callback, '');
  }

  private getFilePaths(folderPath: string, include: RegExp): string[] {
    folderPath = path.normalize(folderPath);

    let files = [];

    fs.readdirSync(folderPath).forEach((fileName: string) => {
      if (include.test(fileName)) {
        files.push(path.join(folderPath, fileName));
      }
    });

    return files;
  }

  private getClassName(prefix: string, id: number): string {
    return prefix + id;
  }

  private getSpriteUrl(result: Result): string {
    return this.options.url.replace('#SPRITE_FILE', `${result.name}${result.extension}`);
  }
}
