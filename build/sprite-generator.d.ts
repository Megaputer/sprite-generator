/**
 * Limitations for icons:
 *  - file name must not start with numbers.
 */
export interface Sprite {
    name: string;
    sourceFolder: string;
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
export declare class SpriteGenerator {
    private options;
    private sizes;
    private queue;
    constructor(options: Options);
    generate(): void;
    private batchSvg;
    private batchPng;
    private done;
    private deleteFolderRecursive;
    private deleteTargetFolders;
    private writeSprite;
    private writeSCSS;
    private writeSizesSCSS;
    private writeTS;
    private writeFile;
    private getAlertComment;
    private createFolderIfNotExist;
    private getFilePaths;
    private getClassName;
    private getSpriteUrl;
}
