setwd(dirname(rstudioapi::getSourceEditorContext()$path))
library(tidyverse)

read_all <- function(pattern) {
  list.dirs("data", recursive = FALSE) %>%
    map_dfr(function(d) {
      f <- list.files(d, pattern = pattern, full.names = TRUE)
      if (length(f) != 1) return(tibble())
      read_csv(f, show_col_types = FALSE) %>%
        mutate(sessionID = basename(d))
    })
}

session       <- read_all("^session\\.")
sampling      <- read_all("^samplingparadigm\\.")
transcription <- read_all("^transcriptions\\.")
