setwd(dirname(rstudioapi::getSourceEditorContext()$path))
library(tidyverse)

read_all <- function(pattern) {
  list.dirs("data", recursive = FALSE) %>%
    map_dfr(function(d) {
      f <- list.files(d, pattern = pattern, full.names = TRUE)
      if (length(f) == 0) return(tibble())
      if (length(f) > 1) {
        warning("Multiple files match '", pattern, "' in ", basename(d),
                "; using the most recently written one.", call. = FALSE)
        f <- f[which.max(file.mtime(f))]
      }
      read_csv(f, show_col_types = FALSE) %>%
        mutate(sessionID = basename(d))
    })
}

session       <- read_all("^session\\.")
sampling      <- read_all("^samplingparadigm\\.")
transcription <- read_all("^transcriptions\\.")
