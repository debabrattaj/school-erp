package com.schoolerp.repository;

import com.schoolerp.entity.HostelRoom;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface HostelRoomRepository extends JpaRepository<HostelRoom, Long> {
    Optional<HostelRoom> findByBlockIdAndRoomNo(Long blockId, String roomNo);
}
