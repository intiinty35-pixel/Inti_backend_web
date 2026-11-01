import { Body, Controller, Get, Post } from "@nestjs/common";
import { CreatePropertyUseCase } from "../application/create-property.use-case";
import { ListPropertiesUseCase } from "../application/list-properties.use-case";
import { CreatePropertyDto } from "./create-property.dto";

@Controller("properties")
export class PropertiesController {
  constructor(
    private readonly createProperty: CreatePropertyUseCase,
    private readonly listProperties: ListPropertiesUseCase,
  ) {}

  @Get()
  list() {
    return this.listProperties.execute();
  }

  @Post()
  create(@Body() input: CreatePropertyDto) {
    return this.createProperty.execute(input);
  }
}
