up:
	@docker-compose up -d

down:
	@docker-compose down
sh:
	@docker-compose exec web /bin/sh
restart:
	@docker-compose restart
rebuild:
	@docker-compose build
clean:
	@docker system prune