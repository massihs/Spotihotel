"use server";

import { refresh, updateTag } from "next/cache";
import type { z } from "zod";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  addOutletTables,
  archiveOutlet,
  createOutlet,
  setOutletMenu,
  updateOutlet,
  type newOutletSchema,
  type outletSchema,
} from "@/server/modules/outlets/service";

const done = <T>(v: T) => {
  refresh();
  return v;
};

export const createOutletAction = async (rid: string, input: z.input<typeof newOutletSchema>) =>
  runAction(async () => done((await createOutlet(db, await actionContext(rid, "tables.manage"), input)).id));

export const updateOutletAction = async (rid: string, id: string, input: z.input<typeof outletSchema>) =>
  runAction(async () => done(await updateOutlet(db, await actionContext(rid, "tables.manage"), id, input)));

export const addOutletTablesAction = async (rid: string, id: string, tables: number, seats: number) =>
  runAction(async () =>
    done((await addOutletTables(db, await actionContext(rid, "tables.manage"), id, { tables, seats })).created),
  );

export const archiveOutletAction = async (rid: string, id: string) =>
  runAction(async () => done(await archiveOutlet(db, await actionContext(rid, "tables.manage"), id)));

export const setOutletMenuAction = async (rid: string, id: string, categoryIds: string[]) =>
  runAction(async () =>
    done(await setOutletMenu(db, await actionContext(rid, "menu.manage"), id, categoryIds, updateTag)),
  );
