import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { SessionGuard, type AuthenticatedRequest } from "../../auth/session.guard";
import { FavoritesService } from "../application/favorites.service";
import { ToggleFavoriteDto } from "./toggle-favorite.dto";

@Controller("favorites")
@UseGuards(SessionGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  /** Agrega la publicación a favoritos o, si ya estaba, la quita. */
  @Post("toggle")
  toggle(@Body() input: ToggleFavoriteDto, @Req() request: AuthenticatedRequest) {
    return this.favorites.toggle(request.auth.id, input.listingType, input.listingId);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.favorites.list(request.auth.id);
  }

  @Get("ids")
  ids(@Req() request: AuthenticatedRequest) {
    return this.favorites.ids(request.auth.id);
  }

  @Get("count")
  async count(@Req() request: AuthenticatedRequest) {
    return { count: await this.favorites.count(request.auth.id) };
  }
}
