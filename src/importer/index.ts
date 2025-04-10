import zlib from "node:zlib";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { Root, descriptor, type SQLiteTagSpawned } from "../proto";
import { sanitizeFileName } from "../utils";

import { NoteConverter } from "../converters";
import SQLiteTag from "../utils/sqlite";
import {
  ANAttachment,
  ANConverter,
  ANFolderType,
  type ANAccount,
  type ANConverterType,
} from "../proto";
import {
  reportAttachmentSuccess,
  reportFailed,
  reportProgress,
  reportSkipped,
} from "../utils/logger";
import {
  createFolders,
  getAvailablePathForAttachment,
  getOutputFolder,
  saveAsMarkdownFile,
  splitext,
  type TFile,
  type TFolder,
} from "../utils/files";

const NOTE_FOLDER_PATH = "~/Library/Group Containers/group.com.apple.notes";
const NOTE_DB = "NoteStore.sqlite";
/** Additional amount of seconds that Apple CoreTime datatypes start at, to convert them into Unix timestamps. */
const CORETIME_OFFSET = 978307200;

export class AppleNotesImporter {
  rootFolder: TFolder;

  database: SQLiteTagSpawned;
  protobufRoot: Root;

  keys: Record<string, number>;
  owners: Record<number, number> = {};
  resolvedAccounts: Record<number, ANAccount> = {};
  resolvedFiles: Record<number, TFile> = {};
  resolvedFolders: Record<number, TFolder> = {};

  multiAccount = false;
  noteCount = 0;
  parsedNotes = 0;

  omitFirstLine = true;
  importTrashed = false;
  includeHandwriting = false;
  trashFolders: number[] = [];

  async getNotesDatabase(): Promise<SQLiteTagSpawned | null> {
    const dataPath = path.join(os.homedir(), NOTE_FOLDER_PATH);

    try {
      await fs.promises.access(dataPath, fs.promises.constants.R_OK);
      const stats = await fs.promises.stat(dataPath);
      if (!stats.isDirectory()) {
        throw new Error("Not a directory");
      }
    } catch {
      console.info(
        "Data import failed. Cannot access Apple Notes data folder at:",
        dataPath
      );
      return null;
    }

    const originalDB = path.join(dataPath, NOTE_DB);
    const clonedDB = path.join(os.tmpdir(), NOTE_DB);

    await fs.promises.copyFile(originalDB, clonedDB);
    await fs.promises.copyFile(originalDB + "-shm", clonedDB + "-shm");
    await fs.promises.copyFile(originalDB + "-wal", clonedDB + "-wal");

    //@ts-expect-error SQLite type definitions are incomplete for the options parameter
    return new SQLiteTag(clonedDB, { readonly: true, persistent: true });
  }

  async import(): Promise<void> {
    this.protobufRoot = Root.fromJSON(descriptor);
    this.rootFolder = await getOutputFolder();

    if (!this.rootFolder) {
      console.info("Please select a location to export to.");
      return;
    }

    this.database = (await this.getNotesDatabase()) as SQLiteTagSpawned;
    if (!this.database) return;

    this.keys = Object.fromEntries(
      (await this.database.all`SELECT z_ent, z_name FROM z_primarykey`).map(
        (k) => [k.Z_NAME, k.Z_ENT]
      )
    );

    const noteAccounts = await this.database.all`
			SELECT z_pk FROM ziccloudsyncingobject WHERE z_ent = ${this.keys.ICAccount}
		`;
    const noteFolders = await this.database.all`
			SELECT z_pk, ztitle2 FROM ziccloudsyncingobject WHERE z_ent = ${this.keys.ICFolder}
		`;

    for (const a of noteAccounts) await this.resolveAccount(a.Z_PK);

    for (const f of noteFolders) {
      try {
        await this.resolveFolder(f.Z_PK);
      } catch (e) {
        reportFailed(f.ZTITLE2, e?.message);
        console.error(e);
      }
    }

    const notes = await this.database.all`
			SELECT
				z_pk, zfolder, ztitle1 FROM ziccloudsyncingobject
			WHERE
				z_ent = ${this.keys.ICNote}
				AND ztitle1 IS NOT NULL
				AND zfolder NOT IN (${this.trashFolders})
		`;
    this.noteCount = notes.length;

    for (const n of notes) {
      try {
        await this.resolveNote(n.Z_PK);
      } catch (e) {
        reportFailed(n.ZTITLE1, e?.message);
        console.error(e);
      }
    }

    this.database.close();
  }

  async resolveAccount(id: number): Promise<void> {
    if (!this.multiAccount && Object.keys(this.resolvedAccounts).length) {
      this.multiAccount = true;
    }

    const account = await this.database.get`
			SELECT zname, zidentifier FROM ziccloudsyncingobject
			WHERE z_ent = ${this.keys.ICAccount} AND z_pk = ${id}
		`;

    this.resolvedAccounts[id] = {
      name: account.ZNAME,
      uuid: account.ZIDENTIFIER,
      path: path.join(
        os.homedir(),
        NOTE_FOLDER_PATH,
        "Accounts",
        account.ZIDENTIFIER
      ),
    };
  }

  async resolveFolder(id: number): Promise<TFolder | null> {
    if (id in this.resolvedFiles) return this.resolvedFolders[id];

    const folder = await this.database.get`
			SELECT ztitle2, zparent, zidentifier, zfoldertype, zowner
			FROM ziccloudsyncingobject
			WHERE z_ent = ${this.keys.ICFolder} AND z_pk = ${id}
		`;
    let prefix;

    if (folder.ZFOLDERTYPE == ANFolderType.Smart) {
      return null;
    } else if (
      !this.importTrashed &&
      folder.ZFOLDERTYPE == ANFolderType.Trash
    ) {
      this.trashFolders.push(id);
      return null;
    } else if (folder.ZPARENT !== null) {
      prefix = (await this.resolveFolder(folder.ZPARENT))?.path + "/";
    } else if (this.multiAccount) {
      // If there's a parent, the account root is already handled by that
      const account = this.resolvedAccounts[folder.ZOWNER].name;
      prefix = `${this.rootFolder.path}/${account}/`;
    } else {
      prefix = `${this.rootFolder.path}/`;
    }

    if (!folder.ZIDENTIFIER.startsWith("DefaultFolder")) {
      // Notes in the default "Notes" folder are placed in the main directory
      prefix += sanitizeFileName(folder.ZTITLE2);
    }

    const resolved = await createFolders(prefix);
    this.resolvedFolders[id] = resolved;
    this.owners[id] = folder.ZOWNER;

    return resolved;
  }

  async resolveNote(id: number): Promise<TFile | null> {
    if (id in this.resolvedFiles) return this.resolvedFiles[id];

    const row = await this.database.get`
			SELECT
				nd.z_pk, hex(nd.zdata) as zhexdata, zcso.ztitle1, zfolder,
				zcreationdate1, zcreationdate2, zcreationdate3, zmodificationdate1, zispasswordprotected
			FROM
				zicnotedata AS nd,
				(SELECT
					*, NULL AS zcreationdate3, NULL AS zcreationdate2,
					NULL AS zispasswordprotected FROM ziccloudsyncingobject
				) AS zcso
			WHERE
				zcso.z_pk = nd.znote
				AND zcso.z_pk = ${id}
		`;

    if (row.ZISPASSWORDPROTECTED) {
      reportSkipped(row.ZTITLE1, "note is password protected");
      return null;
    }

    const folder = this.resolvedFolders[row.ZFOLDER] || this.rootFolder;

    const title = `${row.ZTITLE1}.md`;
    const file = await saveAsMarkdownFile(folder, title, "");

    console.log(`Importing note ${title}`);
    this.resolvedFiles[id] = file;
    this.owners[id] = this.owners[row.ZFOLDER];

    // Notes may reference other notes, so we want them in resolvedFiles before we parse to avoid cycles
    const converter = this.decodeData(row.zhexdata, NoteConverter);

    const content = await converter.format();
    await fs.promises.writeFile(file.path, content);
    await fs.promises.utimes(
      file.path,
      this.decodeTime(row.ZMODIFICATIONDATE1) / 1000, // access time
      this.decodeTime(
        row.ZCREATIONDATE3 || row.ZCREATIONDATE2 || row.ZCREATIONDATE1
      ) / 1000 // modification time
    );

    this.parsedNotes++;
    reportProgress(this.parsedNotes, this.noteCount);
    return file;
  }

  async resolveAttachment(
    id: number,
    uti: ANAttachment | string
  ): Promise<TFile | null> {
    if (id in this.resolvedFiles) return this.resolvedFiles[id];

    let sourcePath, outName, outExt, row, file;

    switch (uti) {
      case ANAttachment.PaperDocScan:
      case ANAttachment.PaperDocPDF:
        // A PDF only seems to be generated when you modify the scan :(
        row = await this.database.get`
					SELECT
						zidentifier, ztitle, zfallbackpdfgeneration, zcreationdate, zmodificationdate, znote
					FROM
						(SELECT *, NULL AS zfallbackpdfgeneration FROM ziccloudsyncingobject)
					WHERE
						z_ent = ${this.keys.ICAttachment}
						AND z_pk = ${id}
				`;
        sourcePath = path.join(
          "FallbackPDFs",
          row.ZIDENTIFIER,
          row.ZFALLBACKPDFGENERATION || "",
          "FallbackPDF.pdf"
        );
        outName = row.ZTITLE ?? "Scan";
        outExt = "pdf";
        break;

      case ANAttachment.Scan:
        row = await this.database.get`
					SELECT
						zidentifier, zsizeheight, zsizewidth, zcreationdate, zmodificationdate, znote
					FROM ziccloudsyncingobject
					WHERE
						z_ent = ${this.keys.ICAttachment}
						AND z_pk = ${id}
				`;

        sourcePath = path.join(
          "Previews",
          `${row.ZIDENTIFIER}-1-${row.ZSIZEWIDTH}x${row.ZSIZEHEIGHT}-0.jpeg`
        );
        outName = "Scan Page";
        outExt = "jpg";
        break;

      case ANAttachment.Drawing:
        row = await this.database.get`
					SELECT
						zidentifier, zfallbackimagegeneration, zcreationdate, zmodificationdate,
						znote, zhandwritingsummary
					FROM
						(SELECT *, NULL AS zfallbackimagegeneration FROM ziccloudsyncingobject)
					WHERE
						z_ent = ${this.keys.ICAttachment}
						AND z_pk = ${id}
				`;

        if (row.ZFALLBACKIMAGEGENERATION) {
          // macOS 14/iOS 17 and above
          sourcePath = path.join(
            "FallbackImages",
            row.ZIDENTIFIER,
            row.ZFALLBACKIMAGEGENERATION,
            "FallbackImage.png"
          );
        } else {
          sourcePath = path.join("FallbackImages", `${row.ZIDENTIFIER}.jpg`);
        }

        outName = "Drawing";
        outExt = "png";
        break;

      default:
        row = await this.database.get`
					SELECT
						a.zidentifier, a.zfilename,
						a.zgeneration1, b.zcreationdate, b.zmodificationdate, b.znote
					FROM
						(SELECT *, NULL AS zgeneration1 FROM ziccloudsyncingobject) AS a,
						ziccloudsyncingobject AS b
					WHERE
						a.z_ent = ${this.keys.ICMedia}
						AND a.z_pk = ${id}
						AND a.z_pk = b.zmedia
				`;

        sourcePath = path.join(
          "Media",
          row.ZIDENTIFIER,
          row.ZGENERATION1 || "",
          row.ZFILENAME
        );
        [outName, outExt] = splitext(row.ZFILENAME);
        break;
    }

    try {
      const binary = await this.getAttachmentSource(
        this.resolvedAccounts[this.owners[row.ZNOTE]],
        sourcePath
      );
      const attachmentPath = await getAvailablePathForAttachment(
        `${outName}.${outExt}`,
        []
      );
      await fs.promises.writeFile(attachmentPath, binary);
      await fs.promises.utimes(
        attachmentPath,
        this.decodeTime(row.ZMODIFICATIONDATE) / 1000,
        this.decodeTime(row.ZCREATIONDATE) / 1000
      );

      file = {
        path: attachmentPath,
        name: path.basename(attachmentPath),
        basename: outName,
        extension: outExt,
        parent: this.rootFolder,
        stat: {
          ctime: this.decodeTime(row.ZCREATIONDATE),
          mtime: this.decodeTime(row.ZMODIFICATIONDATE),
          size: binary.length,
        },
      };
    } catch (e) {
      reportFailed(sourcePath);
      console.error(e);
      return null;
    }

    this.resolvedFiles[id] = file;
    reportAttachmentSuccess(this.resolvedFiles[id].path);
    return file;
  }

  decodeData<T extends ANConverter>(
    hexdata: string,
    converterType: ANConverterType<T>
  ) {
    const unzipped = zlib.gunzipSync(Buffer.from(hexdata, "hex"));
    const messageType = this.protobufRoot.lookupType(
      converterType.protobufType
    );
    const decoded = messageType.decode(unzipped);

    return new converterType(this, decoded);
  }

  decodeTime(timestamp: number): number {
    if (!timestamp || timestamp < 1) return new Date().getTime();
    return Math.floor((timestamp + CORETIME_OFFSET) * 1000);
  }

  async getAttachmentSource(
    account: ANAccount,
    sourcePath: string
  ): Promise<Buffer> {
    try {
      return await fs.promises.readFile(path.join(account.path, sourcePath));
    } catch {
      return await fs.promises.readFile(
        path.join(os.homedir(), NOTE_FOLDER_PATH, sourcePath)
      );
    }
  }
}
