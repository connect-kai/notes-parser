import { normalize as normalizePath, join } from "path";
import { promises as fs } from "fs";
import { sanitizeFileName } from ".";
import * as os from "node:os";

/**
 * This can be either a `TFile` or a `TFolder`.
 * @public
 */
export interface TAbstractFile {
  /**
   * @public
   */
  path: string;
  /**
   * @public
   */
  name: string;
  /**
   * @public
   */
  parent: TFolder | null;
}

/**
 * @public
 */
export interface TFolder extends TAbstractFile {
  /**
   * @public
   */
  children: TAbstractFile[];

  /**
   * @public
   */
  isRoot(): boolean;
}

/**
 * @public
 */
export interface TFile extends TAbstractFile {
  /**
   * @public
   */
  stat: FileStats;
  /**
   * @public
   */
  basename: string;
  /**
   * @public
   */
  extension: string;
}

export interface FileStats {
  /**
   * Time of creation, represented as a unix timestamp, in milliseconds.
   * @public
   */
  ctime: number;
  /**
   * Time of last modification, represented as a unix timestamp, in milliseconds.
   * @public
   */
  mtime: number;
  /**
   * Size on disk, as bytes.
   * @public
   */
  size: number;
}

export async function createFolders(path: string): Promise<TFolder> {
  // can't create folders starting with a dot
  const sanitizedPath = path
    .split("/")
    .map((segment) => segment.replace(/^\.+/, ""))
    .join("/");
  const normalizedPath = normalizePath(sanitizedPath);

  try {
    // Check if the folder exists
    const stats = await fs.stat(normalizedPath);
    if (!stats.isDirectory()) {
      throw new Error("Not a directory");
    }
  } catch {
    // Create the folder if it doesn't exist
    await fs.mkdir(normalizedPath, { recursive: true });
  }

  // Create and return the TFolder object
  const folder: TFolder = {
    path: normalizedPath,
    name: normalizedPath.split("/").pop() || "",
    parent: null,
    children: [],
    isRoot: () => false,
  };

  return folder;
}

export async function getAvailablePathForAttachment(
  filename: string,
  claimedPaths: string[]
): Promise<string> {
  const outputFolder = await getOutputFolder();
  const { basename, extension } = parseFilePath(filename);

  const sanitizedBasename = basename.replace(/\s+/g, "_");
  const attachmentsFolder = join(outputFolder.path, "attachments");
  await createFolders(attachmentsFolder);

  const fullExt = extension ? `.${extension}` : "";
  let outputPath = join(attachmentsFolder, `${sanitizedBasename}${fullExt}`);

  let i = 1;
  while (claimedPaths.includes(outputPath) || (await fileExists(outputPath))) {
    outputPath = join(attachmentsFolder, `${sanitizedBasename}_${i}${fullExt}`);
    i++;
  }

  return outputPath;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function saveAsMarkdownFile(
  folder: TFolder,
  title: string,
  content: string
): Promise<TFile> {
  const sanitizedName = sanitizeFileName(title);
  const filePath = join(folder.path, sanitizedName);

  await fs.writeFile(filePath, content);

  const file: TFile = {
    path: filePath,
    name: sanitizedName,
    basename: sanitizedName,
    extension: "md",
    parent: folder,
    stat: {
      ctime: Date.now(),
      mtime: Date.now(),
      size: Buffer.from(content).length,
    },
  };

  return file;
}

export async function getOutputFolder(): Promise<TFolder> {
  const outputPath = join(os.homedir(), "Documents/AppleNotes");
  const folderPath = await createFolders(outputPath);

  const folder: TFolder = {
    path: folderPath.path,
    name: "AppleNotes",
    parent: null,
    children: [],
    isRoot: () => false,
  };

  return folder;
}

export function parseFilePath(filepath: string): {
  parent: string;
  name: string;
  basename: string;
  extension: string;
} {
  const lastIndex = Math.max(
    filepath.lastIndexOf("/"),
    filepath.lastIndexOf("\\")
  );
  let name = filepath;
  let parent = "";
  if (lastIndex >= 0) {
    name = filepath.substring(lastIndex + 1);
    parent = filepath.substring(0, lastIndex);
  }

  name = name.replace(/\s+/g, "_");
  const [basename, extension] = splitext(name);
  return { parent, name, basename, extension };
}

export function splitext(name: string) {
  const dotIndex = name.lastIndexOf(".");
  let basename = name;
  let extension = "";

  if (dotIndex > 0) {
    basename = name.substring(0, dotIndex);
    extension = name.substring(dotIndex + 1).toLowerCase();
  }

  return [basename, extension];
}
