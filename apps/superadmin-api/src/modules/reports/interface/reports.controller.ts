import { Controller, Get, Header, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { ReportsService } from "../application/reports.service";
import {
  RegistrationsCsvQueryDto,
  RostersCsvQueryDto,
  StandingsCsvQueryDto
} from "./dto/reports.dto";

@ApiTags("reports")
@ApiBearerAuth()
@Controller("reports")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("standings.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @ApiOperation({ summary: "Standings table for a league as CSV" })
  async standings(
    @Query() q: StandingsCsvQueryDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const csv = await this.reports.standings(q.leagueId, q.divisionId);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="standings-${q.leagueId.slice(0, 8)}.csv"`
    );
    return csv;
  }

  @Get("rosters.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @ApiOperation({ summary: "Active memberships as CSV (filter by season or team)" })
  async rosters(
    @Query() q: RostersCsvQueryDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const csv = await this.reports.rosters(q);
    const slug = q.teamId?.slice(0, 8) ?? q.seasonId?.slice(0, 8) ?? "all";
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="rosters-${slug}.csv"`
    );
    return csv;
  }

  @Get("registrations.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @ApiOperation({ summary: "Registrations as CSV (filter by org / league / status)" })
  async registrations(
    @Query() q: RegistrationsCsvQueryDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const csv = await this.reports.registrationsCsv(q);
    const slug = q.orgId?.slice(0, 8) ?? "all";
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="registrations-${slug}.csv"`
    );
    return csv;
  }
}
