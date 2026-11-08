import { Body, Controller, Get, HttpException, HttpStatus, Ip, Patch, Param, Post, Req, UseGuards } from "@nestjs/common";
import { RateLimiter } from "../../../common/rate-limiter";
import { SessionGuard, type AuthenticatedRequest } from "../../auth/session.guard";
import { InquiriesService } from "../application/inquiries.service";
import { CreateInquiryDto } from "./create-inquiry.dto";
import { MarkInquiryReadDto } from "./mark-inquiry-read.dto";

@Controller("inquiries")
export class InquiriesController {
  private readonly attempts = new RateLimiter(8, 60_000);

  constructor(private readonly inquiries: InquiriesService) {}

  @Post()
  @UseGuards(SessionGuard)
  create(@Body() input: CreateInquiryDto, @Ip() ip: string) {
    if (!this.attempts.allow(ip)) {
      throw new HttpException("Estás enviando consultas muy rápido. Espera un minuto e inténtalo de nuevo.", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.inquiries.create(input);
  }

  @Get("mine")
  @UseGuards(SessionGuard)
  mine(@Req() request: AuthenticatedRequest) {
    return this.inquiries.listMine(request.auth.id);
  }

  @Patch(":id/read")
  @UseGuards(SessionGuard)
  setReadStatus(@Param("id") id: string, @Body() input: MarkInquiryReadDto, @Req() request: AuthenticatedRequest) {
    return this.inquiries.setReadStatus(id, request.auth.id, input.read);
  }
}
