#!/bin/bash

function main {
    Command=$1
    shift
    case "${Command}" in
        up)
            docker-compose up -d
            docker-compose scale app=10
            ;;
        down)
            docker-compose down
            ;;
        prepare)
            docker-compose exec haproxy apt-get update
            docker-compose exec haproxy apt-get install -y dnsutils
            ;;
        dig)
            for i in `seq 1 5`
            do
                docker-compose exec haproxy dig app | grep app
                sleep 2
            done
            ;;
        *)  echo "Usage: $0 <up|down|prepare|dig>" ;;
    esac
}

main $@
