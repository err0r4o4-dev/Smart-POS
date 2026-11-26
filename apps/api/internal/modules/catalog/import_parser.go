package catalog

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/xml"
	"io"
	"path"
	"strconv"
	"strings"
	"unicode/utf8"
)

const MaxImportBytes = 5 << 20
const MaxImportRows = 2000
const maxExpandedBytes = 20 << 20

type fileTable struct {
	Headers []string
	Rows    [][]string
}

func parseFile(filename string, data []byte) (fileTable, error) {
	if len(data) == 0 || len(data) > MaxImportBytes {
		return fileTable{}, ErrInput
	}
	var records [][]string
	var err error
	switch strings.ToLower(path.Ext(filename)) {
	case ".csv":
		if !utf8.Valid(data) || bytes.Contains(data, []byte{0}) {
			return fileTable{}, ErrInput
		}
		reader := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(data, []byte{239, 187, 191})))
		reader.FieldsPerRecord = -1
		for {
			row, problem := reader.Read()
			if problem == io.EOF {
				break
			}
			if problem != nil || len(row) > 40 || len(records) > MaxImportRows {
				return fileTable{}, ErrInput
			}
			records = append(records, row)
		}
	case ".xlsx":
		records, err = parseXLSX(data)
	default:
		return fileTable{}, ErrInput
	}
	if err != nil || len(records) < 2 || len(records) > MaxImportRows+1 || len(records[0]) == 0 || len(records[0]) > 40 {
		return fileTable{}, ErrInput
	}
	headers := records[0]
	seen := map[string]bool{}
	for index, value := range headers {
		value = strings.TrimSpace(value)
		if !text(value, 100, true) || seen[strings.ToLower(value)] {
			return fileTable{}, ErrInput
		}
		headers[index] = value
		seen[strings.ToLower(value)] = true
	}
	for _, row := range records[1:] {
		if len(row) != len(headers) {
			return fileTable{}, ErrInput
		}
		for _, value := range row {
			if !text(value, 2000, false) {
				return fileTable{}, ErrInput
			}
		}
	}
	return fileTable{Headers: headers, Rows: records[1:]}, nil
}
func zipContent(file *zip.File) ([]byte, error) {
	stream, err := file.Open()
	if err != nil {
		return nil, ErrInput
	}
	defer stream.Close()
	data, err := io.ReadAll(io.LimitReader(stream, maxExpandedBytes+1))
	if err != nil || len(data) > maxExpandedBytes {
		return nil, ErrInput
	}
	return data, nil
}

type richText struct {
	Text string `xml:"t"`
	Runs []struct {
		Text string `xml:"t"`
	} `xml:"r"`
}

func (value richText) plain() string {
	result := value.Text
	for _, run := range value.Runs {
		result += run.Text
	}
	return result
}
func parseXLSX(data []byte) ([][]string, error) {
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil || len(archive.File) > 100 {
		return nil, ErrInput
	}
	files := map[string]*zip.File{}
	var expanded uint64
	sheetCount := 0
	for _, file := range archive.File {
		if strings.Contains(file.Name, "\\") || strings.HasPrefix(file.Name, "/") || path.Clean(file.Name) != file.Name || strings.HasPrefix(file.Name, "../") || files[file.Name] != nil {
			return nil, ErrInput
		}
		expanded += file.UncompressedSize64
		if expanded > maxExpandedBytes {
			return nil, ErrInput
		}
		files[file.Name] = file
		if strings.HasPrefix(file.Name, "xl/worksheets/") && strings.HasSuffix(file.Name, ".xml") && !strings.Contains(strings.TrimPrefix(file.Name, "xl/worksheets/"), "/") {
			sheetCount++
		}
	}
	if files["[Content_Types].xml"] == nil || files["xl/workbook.xml"] == nil || files["xl/worksheets/sheet1.xml"] == nil || sheetCount != 1 {
		return nil, ErrInput
	}
	shared := []string{}
	if file := files["xl/sharedStrings.xml"]; file != nil {
		content, err := zipContent(file)
		if err != nil {
			return nil, err
		}
		var values struct {
			Items []richText `xml:"si"`
		}
		if xml.Unmarshal(content, &values) != nil || len(values.Items) > MaxImportRows*40 {
			return nil, ErrInput
		}
		for _, item := range values.Items {
			shared = append(shared, item.plain())
		}
	}
	content, err := zipContent(files["xl/worksheets/sheet1.xml"])
	if err != nil {
		return nil, err
	}
	var sheet struct {
		Rows []struct {
			Index int `xml:"r,attr"`
			Cells []struct {
				Ref     string   `xml:"r,attr"`
				Type    string   `xml:"t,attr"`
				Value   string   `xml:"v"`
				Formula *string  `xml:"f"`
				Inline  richText `xml:"is"`
			} `xml:"c"`
		} `xml:"sheetData>row"`
	}
	if xml.Unmarshal(content, &sheet) != nil || len(sheet.Rows) < 2 || len(sheet.Rows) > MaxImportRows+1 {
		return nil, ErrInput
	}
	rows := [][]string{}
	width := 0
	for rowIndex, row := range sheet.Rows {
		if row.Index != rowIndex+1 || len(row.Cells) > 40 {
			return nil, ErrInput
		}
		values := make([]string, 40)
		seen := map[int]bool{}
		last := -1
		for _, cell := range row.Cells {
			if cell.Formula != nil {
				return nil, ErrInput
			}
			column := 0
			letters := 0
			for _, character := range cell.Ref {
				if character < 'A' || character > 'Z' {
					break
				}
				column = column*26 + int(character-'A'+1)
				letters++
			}
			number, err := strconv.Atoi(cell.Ref[letters:])
			column--
			if err != nil || number != row.Index || column < 0 || column >= 40 || seen[column] {
				return nil, ErrInput
			}
			seen[column] = true
			if column > last {
				last = column
			}
			value := cell.Value
			switch cell.Type {
			case "s":
				index, err := strconv.Atoi(value)
				if err != nil || index < 0 || index >= len(shared) {
					return nil, ErrInput
				}
				value = shared[index]
			case "inlineStr":
				value = cell.Inline.plain()
			case "", "n", "str":
			default:
				return nil, ErrInput
			}
			values[column] = value
		}
		if rowIndex == 0 {
			width = last + 1
		}
		if width < 1 || last >= width {
			return nil, ErrInput
		}
		rows = append(rows, values[:width])
	}
	return rows, nil
}
