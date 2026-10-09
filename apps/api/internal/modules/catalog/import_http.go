package catalog

import (
	"context"
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"io"
	"net/http"
	"smartpos/api/internal/modules/identity"
)

func readUpload(writer http.ResponseWriter, request *http.Request) (string, []byte, map[string]string, error) {
	request.Body = http.MaxBytesReader(writer, request.Body, MaxImportBytes+(64<<10))
	reader, err := request.MultipartReader()
	if err != nil {
		return "", nil, nil, ErrInput
	}
	filename := ""
	var data []byte
	mapping := map[string]string{}
	seen := map[string]bool{}
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", nil, nil, ErrInput
		}
		name := part.FormName()
		if seen[name] || (name != "file" && name != "mapping") {
			part.Close()
			return "", nil, nil, ErrInput
		}
		seen[name] = true
		limit := int64(16 << 10)
		if name == "file" {
			limit = MaxImportBytes
		}
		content, err := io.ReadAll(io.LimitReader(part, limit+1))
		part.Close()
		if err != nil || int64(len(content)) > limit {
			return "", nil, nil, ErrInput
		}
		if name == "file" {
			filename = part.FileName()
			data = content
		} else {
			if json.Unmarshal(content, &mapping) != nil {
				return "", nil, nil, ErrInput
			}
		}
	}
	if filename == "" {
		return "", nil, nil, ErrInput
	}
	return filename, data, mapping, nil
}
func (handler Handler) importRoutes(tenant chi.Router) {
	tenant.Post("/products/import/preview", func(writer http.ResponseWriter, request *http.Request) {
		filename, data, mapping, err := readUpload(writer, request)
		if err != nil {
			respond(writer, request, nil, err, 400)
			return
		}
		job, err := handler.Service.PreviewImport(request.Context(), identity.SessionFromContext(request.Context()).User.ID, chi.URLParam(request, "id"), filename, data, mapping)
		respond(writer, request, job, err, 201)
	})
	tenant.Post("/products/import/{jobId}/confirm", bodyEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input struct {
		Mode string `json:"mode"`
	}) (ImportJob, error) {
		return handler.Service.ConfirmImport(ctx, user, org, chi.URLParam(request, "jobId"), input.Mode)
	}))
	tenant.Get("/products/import/{jobId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		return handler.Service.ImportJob(ctx, user, org, chi.URLParam(request, "jobId"))
	}))
}
