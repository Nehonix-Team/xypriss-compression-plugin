package main

import (
	"compress/flate"
	"compress/gzip"
	"flag"
	"io"
	"log"
	"os"

	"github.com/andybalholm/brotli"
)

func main() {
	algo := flag.String("algo", "gzip", "compression algorithm (gzip, deflate, br)")
	level := flag.Int("level", -1, "compression level (-1 for default)")
	flag.Parse()

	var w io.WriteCloser

	switch *algo {
	case "gzip": 
		qw, err := gzip.NewWriterLevel(os.Stdout, *level)
		if err != nil {
			log.Fatalf("failed to create gzip writer: %v", err)
		}
		w = qw
	case "deflate":
		qw, err := flate.NewWriter(os.Stdout, *level)
		if err != nil {
			log.Fatalf("failed to create deflate writer: %v", err)
		}
		w = qw
	case "br":
		options := brotli.WriterOptions{}
		if *level != -1 {
			options.Quality = *level
		} else {
			options.Quality = 6 // Standard default
		}
		w = brotli.NewWriterOptions(os.Stdout, options)
	default:
		log.Fatalf("unsupported algorithm: %s", *algo)
	}

	_, err := io.Copy(w, os.Stdin)
	if err != nil {
		log.Fatalf("failed to copy: %v", err)
	}

	if err := w.Close(); err != nil {
		log.Fatalf("failed to close writer: %v", err)
	}
}
