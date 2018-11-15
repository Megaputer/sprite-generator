"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const Spritesmith = require("spritesmith");
const SVGSpriter = require("svg-sprite");
const pascalCase = require("pascal-case");
class SpriteGenerator {
    constructor(options) {
        this.options = options;
    }
    generate() {
        this.queue = 0;
        this.sizes = [];
        this.deleteTargetFolders();
        this.options.sprites.forEach((sprite, index) => {
            const { name, sourceFolder, include = /\.png$/i } = sprite;
            const files = this.getFilePaths(sourceFolder, include);
            if (!files.length) {
                return;
            }
            console.log(`Processing '${name}' from '${sourceFolder}'...`);
            const extensions = [];
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
            }
            else {
                this.done(`Regular expression "${include.source}" finds different types of files: ${extensions.join(', ')}.`);
            }
        });
    }
    batchSvg(spriteName, files, id) {
        const spriter = new SVGSpriter({
            mode: {
                css: true
            }
        });
        for (const file of files) {
            spriter.add(path.resolve(file), undefined, fs.readFileSync(file, { encoding: 'utf-8' }));
        }
        spriter.compile((error, result, data) => {
            if (error) {
                this.done(error.message);
                return;
            }
            const icons = [];
            for (const shape of data.css.shapes) {
                icons.push({
                    fileName: shape.name,
                    width: shape.width.inner,
                    height: shape.height.inner,
                    x: -shape.position.absolute.x,
                    y: -shape.position.absolute.y
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
    batchPng(spriteName, files, id) {
        Spritesmith.run({ src: files }, (error, result) => {
            if (error) {
                this.done(error.message);
                return;
            }
            let icons = [];
            for (let iconPath in result.coordinates) {
                icons.push(Object.assign({ fileName: path.parse(iconPath).name }, result.coordinates[iconPath]));
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
    done(data) {
        if (typeof data === 'string') {
            console.error(`Error: ${data}`);
        }
        else {
            const errors = [];
            const sizes = [];
            for (const icon of data.icons) {
                const { width, height } = icon;
                if (width !== height) {
                    errors.push(`  Width (${width}px) and height (${height}px) of '${icon.fileName}' have to be same.`);
                }
                else if (sizes.indexOf(width) === -1 && this.sizes.indexOf(width) === -1) {
                    sizes.push(width);
                }
            }
            if (errors.length) {
                console.error(`Errors from sprite '${data.name}':\n` + errors.join('\n'));
            }
            else {
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
    deleteFolderRecursive(folderPath) {
        if (fs.existsSync(folderPath)) {
            fs.readdirSync(folderPath).forEach((file) => {
                const currentPath = path.join(folderPath, file);
                if (fs.lstatSync(currentPath).isDirectory()) {
                    this.deleteFolderRecursive(currentPath);
                }
                else {
                    fs.unlinkSync(currentPath);
                }
            });
            fs.rmdirSync(folderPath);
        }
    }
    deleteTargetFolders() {
        const { targetFolder } = this.options;
        for (const target in targetFolder) {
            this.deleteFolderRecursive(targetFolder[target]);
        }
    }
    writeSprite(result) {
        this.writeFile(path.join(this.options.targetFolder.icons, `${result.name}${result.extension}`), result.sprite);
    }
    writeSCSS(result) {
        const { classes } = this.options;
        let output = (this.getAlertComment() +
            `\n` +
            `@import 'sizes';\n` +
            `\n` +
            `.${classes.base}.${this.getClassName(classes.sprite, result.id)} {\n` +
            `  background-image: url(${this.getSpriteUrl(result)});\n`);
        result.icons.forEach((icon, index) => {
            const x = icon.x === 0 ? '0' : `-${icon.x}px`;
            const y = icon.y === 0 ? '0' : `-${icon.y}px`;
            output += (`\n` +
                `  // ${icon.fileName}\n` +
                `  &.${this.getClassName(classes.icon, index)} {\n` +
                `    background-position: ${x} ${y};\n` +
                `  }\n`);
        });
        output += `}\n`;
        this.writeFile(path.join(this.options.targetFolder.scss, `_${result.name}.scss`), output);
    }
    writeSizesSCSS() {
        if (!this.sizes.length) {
            return;
        }
        this.sizes.sort((a, b) => a - b);
        const { classes } = this.options;
        let output = (this.getAlertComment() +
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
            `}\n`);
        this.writeFile(path.join(this.options.targetFolder.scss, `_sizes.scss`), output);
    }
    writeTS(result) {
        let enumValues = [];
        let infoValues = [];
        const { classes } = this.options;
        const spriteClassName = this.getClassName(classes.sprite, result.id);
        result.icons.forEach((icon, index) => {
            const sizeClassName = this.getClassName(classes.size, icon.width);
            const iconClassName = this.getClassName(classes.icon, index);
            const classNames = `${classes.base} ${spriteClassName} ${sizeClassName} ${iconClassName}`;
            enumValues.push(`  ${pascalCase(icon.fileName)} = '${classNames}'`);
            const infoValue = [`'${classNames}'`, icon.x, icon.y, icon.width, icon.height];
            infoValues.push(`  '${icon.fileName}': i(${infoValue.join(', ')})`);
        });
        let output = (this.getAlertComment() +
            `// tslint:disable:max-line-length\n` +
            `import { IconInfoMap, iconInfo as i } from 'common/sprite';`);
        // Sprite name
        output += (`\n\n` +
            `// Sprite name\n` +
            `export const SPRITE_NAME = '${result.name}';\n\n`);
        // enum CSS classes
        output += (`export const enum Classes {\n` +
            enumValues.join(`,\n`) +
            `\n}\n\n`);
        // map with info
        output += (`// Information about the icons\n` +
            `export const info: IconInfoMap = {\n` +
            infoValues.join(`,\n`) +
            `\n};\n`);
        this.writeFile(path.join(this.options.targetFolder.ts, `${result.name}.ts`), output);
    }
    writeFile(filePath, data) {
        filePath = path.normalize(filePath);
        let file = path.parse(filePath);
        this.createFolderIfNotExist(file.dir);
        fs.writeFileSync(filePath, data);
    }
    getAlertComment() {
        return '// DON\'T MODIFY THIS FILE, IT IS GENERATED AUTOMATICALLY\n';
    }
    createFolderIfNotExist(folderPath) {
        const callback = (currentPath, folder) => {
            currentPath = path.join(currentPath, folder);
            if (!fs.existsSync(currentPath)) {
                fs.mkdirSync(currentPath);
            }
            return currentPath;
        };
        folderPath.split(path.sep).reduce(callback, '');
    }
    getFilePaths(folderPath, include) {
        folderPath = path.normalize(folderPath);
        let files = [];
        fs.readdirSync(folderPath).forEach((fileName) => {
            if (include.test(fileName)) {
                files.push(path.join(folderPath, fileName));
            }
        });
        return files;
    }
    getClassName(prefix, id) {
        return prefix + id;
    }
    getSpriteUrl(result) {
        return this.options.url.replace('#SPRITE_FILE', `${result.name}${result.extension}`);
    }
}
exports.SpriteGenerator = SpriteGenerator;
